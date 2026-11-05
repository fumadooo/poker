// Ledger helpers (server only). Balance = sum(ledger.amount_cents) through the `balances` view.
import { admin } from './supabase';
import { ApiError } from './http';

export const CREDIT_TEST_CENTS = 100_000; // R$ 1.000,00 in play chips
export const CREDIT_TEST_PER_DAY = 5;

export async function balanceOf(userId: string): Promise<number> {
  const { data, error } = await admin().from('balances').select('balance_cents').eq('user_id', userId).maybeSingle();
  if (error) throw new ApiError(500, 'DB_ERROR', 'balance: ' + error.message);
  return Number(data?.balance_cents ?? 0);
}

/** Number of credit_test rows for the user since 00:00 UTC today. */
export async function creditsToday(userId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin()
    .from('ledger')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'credit_test')
    .gte('created_at', start.toISOString());
  if (error) throw new ApiError(500, 'DB_ERROR', 'credits today: ' + error.message);
  return count ?? 0;
}

export async function insertLedger(row: {
  user_id: string;
  kind: 'credit_test' | 'buyin' | 'cashout' | 'rake' | 'adjust';
  amount_cents: number;
  table_id?: string | null;
  hand_id?: string | null;
  meta?: Record<string, unknown>;
}): Promise<number> {
  if (!Number.isInteger(row.amount_cents)) throw new ApiError(500, 'INTERNAL', 'ledger amount must be an integer');
  const { data, error } = await admin()
    .from('ledger')
    .insert({ ...row, meta: row.meta ?? {} })
    .select('id')
    .single();
  if (error) throw new ApiError(500, 'DB_ERROR', 'ledger insert: ' + error.message);
  return Number(data.id);
}
