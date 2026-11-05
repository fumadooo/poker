// POST /api/table/[id]/action { action, amount?, version } -> applyAction + apply_table_update.
// 409 VERSION_CONFLICT · 403 NOT_YOUR_TURN · 400 ILLEGAL_ACTION. { ok, version }
import type { NextRequest } from 'next/server';
import type { ActionKind } from '@poker/engine';
import { ApiError, handle, intField, ok, readJson, requireUser, requireUuid } from '@/lib/server/http';
import { actionMutation, mutate, requireTable } from '@/lib/server/table';


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

    const { seats } = await requireTable(id);
    const mine = seats.find((s) => s.user_id === user.id);
    if (!mine) throw new ApiError(403, 'NOT_SEATED', 'you are not seated at this table');

    const r = await mutate(id, (t, _s, now) => actionMutation(t, mine.seat, action as ActionKind, amount, now), { expectVersion: version });
    return ok({ version: r.version });
  });
}
