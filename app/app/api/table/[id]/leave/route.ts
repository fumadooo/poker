// POST /api/table/[id]/leave -> cashout now (+stack, status 'left') when no hand is running (or the
// caller is out of the current hand); otherwise pending_leave = true and settlement cashes out at hand end.
// { ok, pending?: boolean, balance? }
import type { NextRequest } from 'next/server';
import { ApiError, handle, ok, requireUser, requireUuid } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { balanceOf, insertLedger } from '@/lib/server/ledger';
import { isBettingStreet, requireTable } from '@/lib/server/table';
import { broadcast } from '@/lib/server/realtime';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const { table, seats } = await requireTable(id);
    const mine = seats.find((s) => s.user_id === user.id);
    if (!mine) throw new ApiError(400, 'NOT_SEATED', 'you are not seated at this table');

    const st = table.state;
    const sb = admin();
    const nowIso = new Date().toISOString();

    // In a running hand and still live -> leave at the end of the hand.
    // Ended but not yet settled -> also wait: settlement writes the final stack and cashes out pending leavers.
    let cashNow = false;
    let stack = mine.stack_cents;
    if (!st) cashNow = true;
    else if (st.street === 'ended') cashNow = !!st.settled;
    else if (isBettingStreet(st)) {
      const p = st.players.find((x) => x.seat === mine.seat && x.playerId === user.id);
      if (!p || p.folded || p.sittingOut) {
        cashNow = true;
        if (p) stack = p.stack; // chips committed to the pot are gone; the rest is the live stack
      }
    }

    if (!cashNow) {
      const { error } = await sb.from('seats').update({ pending_leave: true, updated_at: nowIso }).eq('table_id', id).eq('seat', mine.seat).eq('user_id', user.id);
      if (error) throw new ApiError(500, 'DB_ERROR', 'leave: ' + error.message);
      void broadcast(id, table.version);
      return ok({ pending: true });
    }

    // release the seat first (conditional on it still being ours and active), then pay out
    const upd = await sb.from('seats')
      .update({ status: 'left', stack_cents: 0, pending_leave: false, updated_at: nowIso })
      .eq('table_id', id).eq('seat', mine.seat).eq('user_id', user.id).neq('status', 'left')
      .select('seat');
    if (upd.error) throw new ApiError(500, 'DB_ERROR', 'leave: ' + upd.error.message);
    if (!upd.data || upd.data.length === 0) throw new ApiError(409, 'VERSION_CONFLICT', 'seat changed, retry');
    await insertLedger({ user_id: user.id, kind: 'cashout', amount_cents: stack, table_id: id, meta: { seat: mine.seat, reason: 'leave' } });
    void broadcast(id, table.version);
    return ok({ pending: false, cashout: stack, balance: await balanceOf(user.id) });
  });
}
