'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PokerTable } from '@/components/PokerTable';
import { ActionBar } from '@/components/ActionBar';
import { HandLog } from '@/components/HandLog';
import { ShowdownOverlay } from '@/components/ShowdownOverlay';
import { BuyInDialog } from '@/components/BuyInDialog';
import { useCountdown } from '@/components/Timer';
import { api, ApiRequestError } from '@/lib/client/api';
import { getSupabase, MOCK } from '@/lib/client/supabase';
import { useSession } from '@/lib/client/useSession';
import { blindsLabel, fmtCents } from '@/lib/client/money';
import type { ActionKind, LegalActions, TableStateResponse } from '@/lib/client/types';

const ERR: Record<string, string> = {
  VERSION_CONFLICT: 'A mesa mudou. Tente de novo.',
  NOT_YOUR_TURN: 'Não é a sua vez.',
  ILLEGAL_ACTION: 'Ação inválida agora.',
  SEAT_TAKEN: 'Esse assento acabou de ser ocupado.',
  INSUFFICIENT_BALANCE: 'Saldo insuficiente. Pegue fichas de teste no lobby.',
  BUYIN_RANGE: 'Buy-in fora do intervalo da mesa.',
  HTTP_401: 'Sessão expirada. Entre de novo.',
  HTTP_404: 'Mesa não encontrada (ou a API ainda não está no ar).',
};
const errMsg = (e: unknown) => (e instanceof ApiRequestError ? ERR[e.code] ?? e.message ?? e.code : e instanceof Error ? e.message : 'Erro inesperado');

export function TableClient({ id }: { id: string }) {
  const router = useRouter();
  const session = useSession();
  const [data, setData] = useState<TableStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sitSeat, setSitSeat] = useState<number | null>(null);
  const [sitError, setSitError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'mesa' | 'historico'>('mesa');
  const [dismissedHand, setDismissedHand] = useState<string | null>(null);
  const [leavePending, setLeavePending] = useState(false);
  const dataRef = useRef<TableStateResponse | null>(null);
  const inflight = useRef<Promise<TableStateResponse | null> | null>(null);
  const tickBusy = useRef(false);
  const skewRef = useRef(0); // serverNow - Date.now()
  const [skew, setSkew] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  // GET state (deduplicado: uma chamada em voo por vez)
  const refetch = useCallback(async (): Promise<TableStateResponse | null> => {
    if (inflight.current) return inflight.current;
    const p = api
      .getState(id)
      .then((r) => {
        if (typeof r.serverNow === 'number') {
          skewRef.current = r.serverNow - Date.now();
          setSkew(Math.round(skewRef.current / 250) * 250);
        }
        dataRef.current = r;
        setData(r);
        setError(null);
        return r;
      })
      .catch((e: unknown) => {
        setError(errMsg(e));
        return null;
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  }, [id]);

  // mount: GET state + saldo
  useEffect(() => {
    refetch();
    api.getMe().then((m) => setBalance(m.balance)).catch(() => {});
  }, [refetch]);

  // Realtime: canal table:<id>, evento broadcast "state" → refetch
  useEffect(() => {
    if (MOCK) return;
    let channel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null;
    try {
      const sb = getSupabase();
      channel = sb.channel(`table:${id}`).on('broadcast', { event: 'state' }, () => { refetch(); }).subscribe();
    } catch (e) {
      console.error(e);
    }
    return () => {
      if (channel) getSupabase().removeChannel(channel);
    };
  }, [id, refetch]);

  // Polling: 1 s enquanto há deadline (tick quando vencido); 3 s entre mãos para o tick iniciar a próxima.
  const rawDeadline = data?.state?.deadlineAt ?? null;
  // deadline convertido para o relógio local (o timer e o tick usam Date.now() do cliente)
  const deadlineAt = rawDeadline == null ? null : rawDeadline - skew;
  const betweenHands = !!data && (data.state == null || data.state.street === 'ended');
  const seatedCount = data?.seats.filter((s) => s.status === 'sitting').length ?? 0;
  const hasData = !!data;
  useEffect(() => {
    if (!hasData) return;
    const needTickLoop = betweenHands && seatedCount >= 2;
    if (deadlineAt == null && !needTickLoop) return;
    const run = async () => {
      const cur = dataRef.current;
      const dl = cur?.state?.deadlineAt ?? null;
      const past = dl != null && dl - skewRef.current <= Date.now();
      if ((past || needTickLoop) && !tickBusy.current) {
        tickBusy.current = true;
        try { await api.tick(id); } catch { /* idempotente; ignora */ } finally { tickBusy.current = false; }
      }
      refetch();
    };
    const iv = setInterval(run, deadlineAt != null ? 1000 : 3000);
    return () => clearInterval(iv);
  }, [hasData, deadlineAt, betweenHands, seatedCount, id, refetch]);

  const mySeat = data?.me?.seat ?? null;
  const state = data?.state ?? null;
  const legal: LegalActions | null = useMemo(() => {
    const l = data?.legal ?? state?.legal ?? null;
    if (!l || mySeat == null || !state || state.street === 'ended') return null;
    if (l.seat !== mySeat || state.toAct !== mySeat) return null;
    return l;
  }, [data?.legal, state, mySeat]);
  const secondsLeft = useCountdown(legal ? deadlineAt : null);

  const nickOf = useCallback(
    (seat: number | undefined) => {
      if (seat == null) return '—';
      const row = data?.seats.find((s) => s.seat === seat);
      if (row?.user_id && row.user_id === session.userId) return 'Você';
      return row?.nick || `Assento ${seat + 1}`;
    },
    [data?.seats, session.userId],
  );

  // Ação: envia version; 409 → refetch e tenta 1 vez com a nova versão.
  const doAction = useCallback(
    async (action: ActionKind, amount?: number) => {
      const cur = dataRef.current;
      if (!cur || busy) return;
      setBusy(true);
      try {
        try {
          await api.action(id, { action, amount, version: cur.version });
        } catch (e) {
          if (e instanceof ApiRequestError && e.status === 409) {
            const fresh = await refetch();
            if (!fresh) throw e;
            await api.action(id, { action, amount, version: fresh.version });
          } else {
            throw e;
          }
        }
        await refetch();
      } catch (e) {
        showToast(errMsg(e));
        refetch();
      } finally {
        setBusy(false);
      }
    },
    [id, busy, refetch, showToast],
  );

  const sit = async (buyin: number) => {
    if (sitSeat == null) return;
    setBusy(true);
    setSitError(null);
    try {
      await api.sit(id, sitSeat, buyin);
      setSitSeat(null);
      setBalance((b) => (b == null ? b : b - buyin));
      await refetch();
    } catch (e) {
      setSitError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      const r = await api.leave(id);
      if (r.pending) {
        setLeavePending(true);
        showToast('Você sai ao fim desta mão.');
      } else {
        router.push('/');
        return;
      }
      await refetch();
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // o motor recalcula state.pots a cada ação a partir de totalCommitted: já inclui as apostas da rua corrente
  const potTotal = (state?.pots ?? []).reduce((a, p) => a + p.amount, 0);
  const showResult = !!state && state.street === 'ended' && !!state.result && dismissedHand !== state.handId;

  if (error && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-200">{error}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => refetch()}>Tentar de novo</button>
          <Link href="/" className="btn btn-gold">Voltar ao lobby</Link>
        </div>
      </div>
    );
  }
  if (!data) return <div className="flex flex-1 items-center justify-center p-8 text-sm text-white/60">Carregando a mesa…</div>;

  const { table, seats } = data;
  const log = (
    <HandLog events={state?.log ?? []} nick={nickOf} className="h-full" />
  );

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {/* topo */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-[#0b0e0c]/90 px-3 py-2 backdrop-blur sm:px-4">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" aria-label="Voltar ao lobby">← Lobby</Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold">{table.name}</div>
          <div className="truncate text-[11px] text-white/60">
            Blinds {blindsLabel(table.sb_cents, table.bb_cents)} · {seats.filter((s) => s.status !== 'left').length}/{table.max_seats} lugares
            {state ? ` · mão #${state.handNo}` : ''}
          </div>
        </div>
        {balance != null && <span className="hidden rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-gold sm:inline">{fmtCents(balance)}</span>}
        {error && <span className="hidden text-[11px] text-red-300 md:inline" title={error}>sem conexão</span>}
        {mySeat != null && (
          <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={leave} disabled={busy || leavePending}>
            {leavePending ? 'Saindo…' : 'Sair da mesa'}
          </button>
        )}
      </header>

      {/* abas (mobile) */}
      <div className="flex border-b border-white/10 md:hidden">
        {(['mesa', 'historico'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider ${mobileTab === t ? 'border-b-2 border-gold text-gold' : 'text-white/50'}`}
          >
            {t === 'mesa' ? 'Mesa' : 'Histórico'}
          </button>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-2 sm:p-4 md:flex-row">
        {/* mesa + ações */}
        <div className={`flex min-w-0 flex-1 flex-col gap-3 ${mobileTab === 'historico' ? 'hidden md:flex' : ''}`}>
          <div className="relative">
            <PokerTable deadlineAt={deadlineAt} myHole={data.me?.hole ?? []} table={table} seats={seats} state={state} mySeat={mySeat} canSit={mySeat == null && !busy} onSit={(seat) => { setSitError(null); setSitSeat(seat); }} />
            {showResult && state?.result && (
              <ShowdownOverlay result={state.result} board={state.board} nick={nickOf} onClose={() => setDismissedHand(state.handId)} />
            )}
          </div>
          {mySeat != null ? (
            <div className="sticky bottom-0 z-30 -mx-2 bg-[#0b1410]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur sm:mx-0 sm:px-0 md:static md:bg-transparent md:p-0">
              <ActionBar legal={legal} potTotal={potTotal} currentBet={state?.currentBet ?? 0} busy={busy} secondsLeft={secondsLeft} onAction={doAction} />
            </div>
          ) : (
            <div className="panel px-4 py-3 text-center text-sm text-white/60">Você está assistindo. Toque em um assento livre para sentar.</div>
          )}
        </div>

        {/* histórico: coluna direita (desktop) / aba (mobile) */}
        <aside className={`md:w-80 md:shrink-0 ${mobileTab === 'mesa' ? 'hidden md:block' : 'block'}`}>
          <div className="h-[60vh] md:sticky md:top-16 md:h-[calc(100dvh-5rem)]">{log}</div>
        </aside>
      </div>

      {sitSeat != null && (
        <BuyInDialog
          seat={sitSeat}
          min={table.min_buyin_cents}
          max={table.max_buyin_cents}
          balance={balance}
          busy={busy}
          error={sitError}
          onConfirm={sit}
          onClose={() => { if (!busy) setSitSeat(null); }}
        />
      )}

      {toast && (
        <div className="fade-in pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-black/85 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
