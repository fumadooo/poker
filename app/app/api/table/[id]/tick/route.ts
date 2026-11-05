// POST /api/table/[id]/tick -> applies an expired deadline (fold/check), settles an ended hand, starts the
// next hand when possible (>= 2 seated with chips, >= 3 s after the end). Idempotent. { ok, changed, version }
import type { NextRequest } from 'next/server';
import { handle, ok, requireUser, requireUuid } from '@/lib/server/http';
import { mutate, tickMutation } from '@/lib/server/table';


type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireUser(req);
    const id = requireUuid((await ctx.params).id);
    const r = await mutate(id, tickMutation);
    return ok({ changed: r.changed, version: r.version });
  });
}
