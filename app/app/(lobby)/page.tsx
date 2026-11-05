'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { CreateTableForm } from '@/components/CreateTableForm';
import { api, ApiRequestError } from '@/lib/client/api';
import { blindsLabel, fmtCentsShort } from '@/lib/client/money';
import type { CreateTableBody, TablePublic } from '@/lib/client/types';

function errMsg(e: unknown): string {
  if (e instanceof ApiRequestError) {
    const map: Record<string, string> = {
      CREDIT_LIMIT: 'Limite de 5 créditos de teste por dia.',
      HTTP_401: 'Sessão expirada. Entre de novo.',
      HTTP_404: 'A API ainda não está no ar.',
      TABLE_LIMIT: 'Limite de 3 mesas por dia atingido.',
      HTTP_429: 'Muitas tentativas. Espere um pouco.',
      BAD_STAKES: 'Blinds não permitidos.',
      BAD_RAKE: 'Rake inválido.',
      BUYIN_RANGE: 'Buy-in fora do intervalo permitido.',
    };
    const label = map[e.code] ?? (e.status === 429 ? map.HTTP_429 : undefined);
    if (label && e.message && e.message !== label && e.message !== e.code) return `${label} (${e.message})`;
    return label ?? e.message ?? e.code;
  }
  return e instanceof Error ? e.message : 'Erro inesperado';
}

export default function LobbyPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TablePublic[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, me] = await Promise.all([api.listTables(), api.getMe().catch(() => null)]);
      setTables(t);
      if (me) setBalance(me.balance);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
      setTables((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const credit = async () => {
    setCreditBusy(true);
    setCreditMsg(null);
    try {
      const r = await api.credit();
      setBalance(r.balance);
      setCreditMsg('+R$ 1.000,00 em fichas de teste.');
    } catch (e) {
      setCreditMsg(errMsg(e));
    } finally {
      setCreditBusy(false);
    }
  };

  const create = async (body: CreateTableBody) => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const r = await api.createTable(body);
      router.push(`/table/${encodeURIComponent(r.id)}`);
    } catch (e) {
      setCreateError(errMsg(e));
      setCreateBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <Header balance={balance} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
        <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Lobby</h1>
            <p className="text-sm text-white/60">Texas Hold&apos;em sem limite · fichas de teste (play money)</p>
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <div className="flex gap-2">
              <button type="button" className="btn btn-gold" onClick={credit} disabled={creditBusy}>
                {creditBusy ? 'Creditando…' : 'Fichas de teste +R$ 1.000'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? 'Fechar' : 'Criar mesa'}
              </button>
            </div>
            {creditMsg && <span className="text-xs text-white/70">{creditMsg}</span>}
          </div>
        </section>

        {showCreate && <CreateTableForm busy={createBusy} error={createError} onSubmit={create} onCancel={() => setShowCreate(false)} />}

        {error && <div className="rounded-lg border border-red-400/30 bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>}

        <section className="panel overflow-hidden">
          <div className="flex items-center border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <span className="flex-1">Mesa</span>
            <span className="w-28 text-right sm:w-36">Blinds</span>
            <span className="w-16 text-right sm:w-20">Lugares</span>
            <span className="hidden w-44 text-right sm:block">Buy-in</span>
          </div>
          {tables == null && <div className="px-4 py-6 text-center text-sm text-white/50">Carregando mesas…</div>}
          {tables?.length === 0 && <div className="px-4 py-6 text-center text-sm text-white/50">Nenhuma mesa aberta. Crie a primeira.</div>}
          <ul>
            {tables?.map((t) => {
              const seated = t.seated ?? 0;
              const full = seated >= t.max_seats;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/table/${encodeURIComponent(t.id)}`)}
                    className="flex w-full items-center px-4 py-3 text-left transition hover:bg-white/5"
                  >
                    <span className="flex flex-1 flex-col">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-xs text-white/50 sm:hidden">
                        Buy-in {fmtCentsShort(t.min_buyin_cents)} – {fmtCentsShort(t.max_buyin_cents)}
                      </span>
                    </span>
                    <span className="w-28 whitespace-nowrap text-right font-mono text-xs text-gold sm:w-36 sm:text-sm">{blindsLabel(t.sb_cents, t.bb_cents)}</span>
                    <span className={`w-16 text-right text-sm sm:w-20 ${full ? 'text-red-300' : seated > 0 ? 'text-green-300' : 'text-white/60'}`}>
                      {seated}/{t.max_seats}
                    </span>
                    <span className="hidden w-44 text-right text-sm text-white/70 sm:block">
                      {fmtCentsShort(t.min_buyin_cents)} – {fmtCentsShort(t.max_buyin_cents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
