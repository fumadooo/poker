// GET /api/me -> { ok, id, email, nick, balance } (balance in cents = sum of the caller's ledger)
import type { NextRequest } from 'next/server';
import { handle, ok, requireUser } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { balanceOf } from '@/lib/server/ledger';


export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const [{ data: profile }, balance] = await Promise.all([
      admin().from('profiles').select('nick').eq('id', user.id).maybeSingle(),
      balanceOf(user.id),
    ]);
    return ok({ id: user.id, email: user.email ?? null, nick: profile?.nick ?? null, balance });
  });
}
