'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MOCK = process.env.NEXT_PUBLIC_MOCK === '1';

let client: SupabaseClient | null = null;

/** Cliente Supabase do navegador (sessão em cookie, lida pelas API routes). Lazy: só cria quando usado. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados');
  }
  client = createBrowserClient(url, key);
  return client;
}
