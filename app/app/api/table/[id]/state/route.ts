// GET /api/table/[id]/state -> { ok, table (public cols), seats, state: publicView(state, me), me: { seat, hole },
// legal: legalActions for the viewer or null, version, serverNow }. Never returns the deck, the seed (only seedHash), or
// another player's hole cards (engine publicView).
import { connection, type NextRequest } from 'next/server';
import { ApiError, handle, ok, requireUuid } from '@/lib/server/http';
import { admin, userFromRequest } from '@/lib/server/supabase';
import { legalFor, publicTable, publicView, requireTable } from '@/lib/server/table';


type Ctx = { params: Promise<{ id: string }> };

interface SeatWithNick {
  seat: number;
  user_id: string;
  stack_cents: number;
  status: string;
  pending_leave: boolean;
  profiles: { nick: string } | { nick: string }[] | null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  await connection();
  return handle(async () => {
    // public read (spectators/anon allowed): publicView hides every hole card except the viewer's own
    const user = await userFromRequest(req);
    const uid = user?.id ?? null;
    const id = requireUuid((await ctx.params).id);
    const { table } = await requireTable(id);
    const { data: seatRows, error } = await admin()
      .from('seats')
      .select('seat,user_id,stack_cents,status,pending_leave,profiles(nick)')
      .eq('table_id', id)
      .neq('status', 'left')
      .order('seat', { ascending: true });
    if (error) throw new ApiError(500, 'DB_ERROR', 'seats: ' + error.message);

    const seats = ((seatRows ?? []) as unknown as SeatWithNick[]).map((s) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return { seat: s.seat, user_id: s.user_id, nick: p?.nick ?? null, stack_cents: s.stack_cents, status: s.status, pending_leave: s.pending_leave };
    });
    const mine = (uid ? seats.find((s) => s.user_id === uid) : undefined) ?? null;
    const st = table.state;
    const view = st ? publicView(st, uid) : null;
    const myPlayer = st && uid ? st.players.find((p) => p.playerId === uid) : undefined;
    const me = { seat: mine ? mine.seat : null, hole: myPlayer ? myPlayer.hole.slice() : [] };
    const legal = legalFor(st, uid);

    return ok({ table: publicTable(table), seats, state: view, me, legal, version: table.version, serverNow: Date.now() });
  });
}
