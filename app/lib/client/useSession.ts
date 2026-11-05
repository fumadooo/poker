'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, MOCK } from './supabase';
import { MOCK_USER_ID } from './mock';

export interface SessionInfo {
  loading: boolean;
  userId: string | null;
  email: string | null;
}

const mockSession: SessionInfo = { loading: false, userId: MOCK_USER_ID, email: 'voce@exemplo.com.br' };

/** Sessão Supabase do lado do cliente (v1). Em MOCK devolve um usuário fixo. */
export function useSession(): SessionInfo {
  const [info, setInfo] = useState<SessionInfo>(MOCK ? mockSession : { loading: true, userId: null, email: null });

  useEffect(() => {
    if (MOCK) return;
    let alive = true;
    const apply = (s: Session | null) => {
      if (!alive) return;
      setInfo({ loading: false, userId: s?.user?.id ?? null, email: s?.user?.email ?? null });
    };
    let unsub = () => {};
    try {
      const sb = getSupabase();
      sb.auth.getSession().then(({ data }) => apply(data.session));
      const { data } = sb.auth.onAuthStateChange((_event, s) => apply(s));
      unsub = () => data.subscription.unsubscribe();
    } catch (e) {
      console.error(e);
      apply(null);
    }
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return info;
}

export async function signOut() {
  if (MOCK) return;
  await getSupabase().auth.signOut();
}
