'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/client/useSession';

/** Verificação de sessão no cliente (v1). Sem sessão → /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.loading && !session.userId) router.replace('/login');
  }, [session.loading, session.userId, router]);

  if (session.loading || !session.userId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-white/60">
        {session.loading ? 'Verificando sessão…' : 'Redirecionando para o login…'}
      </div>
    );
  }
  return <>{children}</>;
}
