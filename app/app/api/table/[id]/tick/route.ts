// POST /api/table/[id]/tick -> applies an expired deadline (fold/check), settles an ended hand, starts the
// next hand when possible (>= 2 seated with chips, >= 3 s after the end). Idempotent. { ok, changed, version }
// Only players seated at the table drive it; anyone else gets a no-op (one read, no writes).
import type { NextRequest } from 'next/server';
import { handle, ok, requireUser, requireUuid } from '@/lib/server/http';
import { mutate, requireTable, tickMutation } from '@/lib/server/table';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const { table, seats } = await requireTable(id);
    const seated = seats.some((s) => s.user_id === user.id) || !!table.state?.players.some((p) => p.playerId === user.id);
    if (!seated) return ok({ changed: false, version: table.version, ignored: 'NOT_SEATED' });
    const r = await mutate(id, tickMutation);
    return ok({ changed: r.changed, version: r.version });
  });
}
