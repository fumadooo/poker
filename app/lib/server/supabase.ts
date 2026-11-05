// SERVER ONLY. Never import this from client code: it holds the service-role key.
// - admin(): service-role client (bypasses RLS; every write in the API goes through it).
// - userFromRequest(req): the caller's Supabase Auth user from the session cookie (@supabase/ssr)
//   or from an `Authorization: Bearer <access_token>` header (tools/smoke_api.py), else null.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

let _admin: SupabaseClient | null = null;

/** Service-role client. Stateless (no session persistence), safe to share across requests. */
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-poker-api': '1' } },
  });
  return _admin;
}

/** Resolve the authenticated user for a Route Handler request (cookie session or Bearer token). */
export async function userFromRequest(req: NextRequest): Promise<User | null> {
  const auth = req.headers.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, '').trim();
    if (!token) return null;
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  }
  const sb = createServerClient(env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => req.cookies.getAll(),
      // Route Handlers answer JSON; we never refresh/set cookies here (the browser client owns the session).
      setAll: () => {},
    },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
