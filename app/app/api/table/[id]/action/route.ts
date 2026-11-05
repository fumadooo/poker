// POST /api/table/[id]/action { action, amount?, version } -> applyAction + apply_table_update.
// 409 VERSION_CONFLICT · 403 NOT_IN_HAND / NOT_YOUR_TURN · 400 ILLEGAL_ACTION. { ok, version }
// The acting seat is derived from the engine state (state.players[].playerId === caller), never from the request
// or from the seats table (a re-seated user can't act for the previous occupant of the seat).
import type { NextRequest } from 'next/server';
import type { ActionKind } from '@poker/engine';
import { ApiError, handle, intField, ok, readJson, requireUser, requireUuid } from '@/lib/server/http';
import { actionMutation, mutate } from '@/lib/server/table';


type Ctx = { params: Promise<{ id: string }> };
const ACTIONS: ReadonlySet<string> = new Set(['fold', 'check', 'call', 'bet', 'raise', 'allin']);

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const body = await readJson(req);
    const action = typeof body.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) throw new ApiError(400, 'BAD_REQUEST', 'action must be fold|check|call|bet|raise|allin');
    const amount = intField(body, 'amount', { min: 0 }) ?? undefined;
    const version = intField(body, 'version', { min: 0, required: true })!;

    const r = await mutate(id, (t, _s, now) => actionMutation(t, user.id, action as ActionKind, amount, now), { expectVersion: version });
    return ok({ version: r.version });
  });
}
