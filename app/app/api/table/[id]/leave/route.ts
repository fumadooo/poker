// POST /api/table/[id]/leave -> RPC leave_table (migration 0002), under the table row lock:
// - the caller plays the live hand (folded or not, or the hand ended but is not settled yet) -> pending_leave = true;
//   settle_hand cashes out the final stack and frees the seat at the end of the hand;
// - otherwise -> cashout now (+stack, status 'left').
// A folded player can therefore never be paid mid-hand nor free a seat that the hand still writes to.
// { ok, pending, cashout?, balance? }
import type { NextRequest } from 'next/server';
import { handle, ok, requireUser, requireUuid } from '@/lib/server/http';
import { rpcJson } from '@/lib/server/table';
import { broadcast } from '@/lib/server/realtime';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const r = await rpcJson<{ pending: boolean; cashout?: number; balance?: number; version: number }>('leave_table', {
      p_user: user.id, p_table: id,
    });
    void broadcast(id, Number(r.version));
    if (r.pending) return ok({ pending: true });
    return ok({ pending: false, cashout: Number(r.cashout), balance: Number(r.balance) });
  });
}
