// POST /api/me/credit -> +100.000 cents of play chips, max 5 per user per UTC day. { ok, balance }
// Atomic: RPC credit_test (migration 0002) counts + inserts under a per-user advisory lock (no race).
import type { NextRequest } from 'next/server';
import { handle, ok, requireUser } from '@/lib/server/http';
import { rpcJson } from '@/lib/server/table';


export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const r = await rpcJson<{ balance: number }>('credit_test', { p_user: user.id });
    return ok({ balance: Number(r.balance) });
  });
}
