// POST /api/table/[id]/sit { seat, buyin } -> ledger buyin (-buyin), seat 'sitting' with stack = buyin.
// Errors: SEAT_TAKEN, INSUFFICIENT_BALANCE, BUYIN_RANGE, ALREADY_SEATED, BAD_REQUEST.
import type { NextRequest } from 'next/server';
import { ApiError, handle, intField, ok, readJson, requireUser, requireUuid } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { balanceOf, insertLedger } from '@/lib/server/ledger';
import { mutate, requireTable, startNextHandIfPossible } from '@/lib/server/table';
import { broadcast } from '@/lib/server/realtime';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const body = await readJson(req);
    const seat = intField(body, 'seat', { min: 0, max: 8, required: true })!;
    const buyin = intField(body, 'buyin', { min: 1, required: true })!;

    const { table, seats } = await requireTable(id);
    if (seat >= table.max_seats) throw new ApiError(400, 'BAD_REQUEST', `seat must be in 0..${table.max_seats - 1}`);
    if (buyin < table.min_buyin_cents || buyin > table.max_buyin_cents) {
      throw new ApiError(400, 'BUYIN_RANGE', `buyin must be in ${table.min_buyin_cents}..${table.max_buyin_cents}`);
    }
    if (seats.some((s) => s.user_id === user.id)) throw new ApiError(400, 'ALREADY_SEATED', 'you already sit at this table');
    if (seats.some((s) => s.seat === seat)) throw new ApiError(400, 'SEAT_TAKEN', 'seat is taken');
    const balance = await balanceOf(user.id);
    if (balance < buyin) throw new ApiError(400, 'INSUFFICIENT_BALANCE', `balance ${balance} < buyin ${buyin}`);

    // claim the seat first (PK table_id+seat; a 'left' row may still occupy the PK -> conditional update)
    const sb = admin();
    const nowIso = new Date().toISOString();
    const fresh = { user_id: user.id, stack_cents: buyin, status: 'sitting', pending_leave: false, joined_at: nowIso, updated_at: nowIso };
    const ins = await sb.from('seats').insert({ table_id: id, seat, ...fresh });
    if (ins.error) {
      if (ins.error.code !== '23505') throw new ApiError(500, 'DB_ERROR', 'sit: ' + ins.error.message);
      // PK conflict: either the seat holds a 'left' row (reuse it) or someone sat down a moment ago
      const upd = await sb.from('seats').update(fresh).eq('table_id', id).eq('seat', seat).eq('status', 'left').select('seat');
      if (upd.error) {
        // unique active-seat-per-user index also reports 23505
        if (upd.error.code === '23505') throw new ApiError(400, 'ALREADY_SEATED', 'you already sit at this table');
        throw new ApiError(500, 'DB_ERROR', 'sit: ' + upd.error.message);
      }
      if (!upd.data || upd.data.length === 0) throw new ApiError(400, 'SEAT_TAKEN', 'seat is taken');
    }

    // move the chips: ledger buyin (negative). If it fails, release the seat.
    try {
      await insertLedger({ user_id: user.id, kind: 'buyin', amount_cents: -buyin, table_id: id, meta: { seat } });
    } catch (e) {
      await sb.from('seats').update({ status: 'left', stack_cents: 0, updated_at: nowIso }).eq('table_id', id).eq('seat', seat).eq('user_id', user.id);
      throw e;
    }

    // a hand may start right away (idempotent with tick)
    // (the seat is already bought; a failure here only delays the start to the next tick)
    let version = table.version;
    try {
      const r = await mutate(id, (t, s, now) => {
        const st = startNextHandIfPossible(t, s, now);
        return st ? { state: st, handNo: st.handNo, button: st.button } : null;
      });
      version = r.version;
      if (!r.changed) void broadcast(id, r.version);
    } catch (e) {
      console.warn('[sit] start hand deferred to tick:', e instanceof Error ? e.message : e);
      void broadcast(id, version);
    }
    return ok({ seat, stack: buyin, balance: balance - buyin, version });
  });
}
