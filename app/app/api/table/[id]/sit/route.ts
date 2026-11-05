// POST /api/table/[id]/sit { seat, buyin } -> ledger buyin (-buyin), seat 'sitting' with stack = buyin.
// Errors: SEAT_TAKEN, SEAT_IN_HAND, INSUFFICIENT_BALANCE, BUYIN_RANGE, ALREADY_SEATED, BAD_REQUEST.
// Atomic: RPC buyin (migration 0002) = per-user advisory lock + table row lock, balance check, seat claim and
// ledger insert in one transaction (parallel buy-ins can never overdraw; ledger_guard trigger backs it up).
import type { NextRequest } from 'next/server';
import { handle, intField, ok, readJson, requireUser, requireUuid } from '@/lib/server/http';
import { mutate, rpcJson, startNextHandIfPossible } from '@/lib/server/table';
import { broadcast } from '@/lib/server/realtime';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const body = await readJson(req);
    const seat = intField(body, 'seat', { min: 0, max: 8, required: true })!;
    const buyin = intField(body, 'buyin', { min: 1, required: true })!;

    const r = await rpcJson<{ seat: number; stack: number; balance: number; version: number }>('buyin', {
      p_user: user.id, p_table: id, p_seat: seat, p_amount: buyin,
    });

    // a hand may start right away (idempotent with tick)
    // (the seat is already bought; a failure here only delays the start to the next tick)
    let version = Number(r.version);
    try {
      const m = await mutate(id, (t, s, now) => {
        const st = startNextHandIfPossible(t, s, now);
        return st ? { state: st, handNo: st.handNo, button: st.button } : null;
      });
      version = m.version;
      if (!m.changed) void broadcast(id, m.version);
    } catch (e) {
      console.warn('[sit] start hand deferred to tick:', e instanceof Error ? e.message : e);
      void broadcast(id, version);
    }
    return ok({ seat, stack: Number(r.stack), balance: Number(r.balance), version });
  });
}
