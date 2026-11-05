// POST /api/me/credit -> +100.000 cents of play chips, max 5 per user per UTC day. { ok, balance }
import type { NextRequest } from 'next/server';
import { ApiError, handle, ok, requireUser } from '@/lib/server/http';
import { CREDIT_TEST_CENTS, CREDIT_TEST_PER_DAY, balanceOf, creditsToday, insertLedger } from '@/lib/server/ledger';


export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const n = await creditsToday(user.id);
    if (n >= CREDIT_TEST_PER_DAY) {
      throw new ApiError(400, 'CREDIT_LIMIT', `limit of ${CREDIT_TEST_PER_DAY} test credits per day reached`);
    }
    await insertLedger({ user_id: user.id, kind: 'credit_test', amount_cents: CREDIT_TEST_CENTS, meta: { n: n + 1 } });
    return ok({ balance: await balanceOf(user.id) });
  });
}
