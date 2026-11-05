'use client';

import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';
import { fmtCentsShort } from '@/lib/client/money';
import type { HandState, SeatRow, TablePublic } from '@/lib/client/types';

export interface PokerTableProps {
  table: TablePublic;
  seats: SeatRow[];
  state: HandState | null;
  mySeat: number | null;
  canSit: boolean;
  onSit: (seat: number) => void;
  deadlineAt?: number | null; // deadline já no relógio local (corrigido pelo serverNow)
  myHole?: string[]; // me.hole da API: fallback se state.players não trouxer as minhas cartas
}

const STREET_LABEL: Record<string, string> = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', ended: 'Fim da mão' };

/** Posição (%) do assento k (0 = embaixo, sentido horário) numa elipse. */
function seatPos(k: number, n: number, rx: number, ry: number) {
  const ang = Math.PI / 2 + (2 * Math.PI * k) / n;
  return { x: 50 + rx * Math.cos(ang), y: 50 + ry * Math.sin(ang) };
}

export function PokerTable({ table, seats, state, mySeat, canSit, onSit, deadlineAt, myHole = [] }: PokerTableProps) {
  const n = table.max_seats;
  const anchor = mySeat ?? 0; // meu assento fica embaixo
  const handInProgress = !!state && state.street !== 'ended';
  const seatRows = new Map(seats.filter((s) => s.status !== 'left').map((s) => [s.seat, s]));
  const players = new Map((state?.players ?? []).map((p) => [p.seat, p]));
  const shown = new Map((state?.result?.shown ?? []).map((s) => [s.seat, s.hole]));
  const winners = new Set((state?.result?.winners ?? []).map((w) => w.seat));
  // state.pots já inclui as apostas da rua corrente (motor recalcula por totalCommitted)
  const potTotal = (state?.pots ?? []).reduce((a, p) => a + p.amount, 0);

  return (
    <div className="relative mx-auto mt-8 mb-16 w-full max-w-[900px] aspect-[3/4] sm:mt-6 sm:aspect-[16/10] select-none">
      {/* oval */}
      <div className="felt absolute inset-[12%] rounded-[50%]" />

      {/* centro: board + potes */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {state ? (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {STREET_LABEL[state.street] ?? state.street} · Mão #{state.handNo}
            </div>
            {state.street === 'ended' && (
              <div className="rounded-full bg-black/50 px-3 py-0.5 text-[11px] text-white/80">Mão liquidada · próxima em instantes</div>
            )}
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard key={i} card={state.board[i]} faceDown={false} size="md" className={state.board[i] ? '' : 'invisible'} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {state.pots.length > 1
                ? state.pots.map((p, i) => (
                    <span key={i} className="chip">
                      {i === 0 ? 'Pote' : `Side ${i}`}: {fmtCentsShort(p.amount)}
                    </span>
                  ))
                : <span className="chip">Pote: {fmtCentsShort(potTotal)}</span>}
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-black/40 px-4 py-2 text-center text-sm text-white/80">
            {seats.filter((s) => s.status === 'sitting').length >= 2 ? 'Próxima mão começando…' : 'Aguardando jogadores (mínimo 2)'}
          </div>
        )}
      </div>

      {/* assentos */}
      {Array.from({ length: n }, (_, seat) => {
        const k = (seat - anchor + n) % n;
        const pos = seatPos(k, n, 44, 44);
        const betPos = seatPos(k, n, 26, 24);
        const row = seatRows.get(seat) ?? null;
        const p0 = players.get(seat) ?? null;
        const player = p0 && mySeat === seat && p0.hole.length === 0 && myHole.length > 0 && !p0.folded ? { ...p0, hole: myHole } : p0;
        return (
          <div key={seat}>
            <Seat
              seat={seat}
              row={row}
              player={player}
              isMe={mySeat === seat}
              isButton={!!state && state.button === seat}
              isSB={!!state && state.sbSeat === seat}
              isBB={!!state && state.bbSeat === seat}
              toAct={!!state && state.toAct === seat && handInProgress}
              deadlineAt={deadlineAt !== undefined ? deadlineAt : state?.deadlineAt ?? null}
              actionSeconds={state?.config.actionSeconds ?? 20}
              shownHole={shown.get(seat)}
              isWinner={winners.has(seat)}
              handInProgress={handInProgress}
              canSit={canSit}
              onSit={onSit}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            />
            {player && player.committed > 0 && (
              <span className="chip absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${betPos.x}%`, top: `${betPos.y}%` }}>
                {fmtCentsShort(player.committed)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
