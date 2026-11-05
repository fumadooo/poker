'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase, MOCK } from '@/lib/client/supabase';
import { useSession } from '@/lib/client/useSession';

type Step = 'email' | 'code';

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // já logado (ou voltou do magic link) → lobby
  useEffect(() => {
    if (!session.loading && session.userId) router.replace('/');
  }, [session.loading, session.userId, router]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (MOCK) return router.replace('/');
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setStep('code');
      setInfo('Enviamos um código e um link para o seu e-mail.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
      if (error) throw error;
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-lg text-black">♠</span>
          <div>
            <h1 className="text-xl font-black tracking-tight">POKER</h1>
            <p className="text-xs text-white/50">Entre com o seu e-mail</p>
          </div>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-white/60">
              E-mail
              <input
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com.br"
              />
            </label>
            <button type="submit" className="btn btn-gold" disabled={busy || !email}>
              {busy ? 'Enviando…' : 'Receber código por e-mail'}
            </button>
            <p className="text-center text-[11px] text-white/40">Sem senha: você recebe um código de 6 dígitos (ou um link) e entra.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            {info && <p className="text-sm text-white/70">{info}</p>}
            <label className="flex flex-col gap-1 text-xs text-white/60">
              Código de 6 dígitos
              <input
                className="input text-center font-mono text-2xl tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </label>
            <button type="submit" className="btn btn-gold" disabled={busy || code.length < 6}>
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
            <button type="button" className="btn btn-ghost !text-xs" onClick={() => { setStep('email'); setCode(''); setInfo(null); }} disabled={busy}>
              Usar outro e-mail
            </button>
            <p className="text-center text-[11px] text-white/40">Se clicou no link do e-mail, esta aba pode ser fechada.</p>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
