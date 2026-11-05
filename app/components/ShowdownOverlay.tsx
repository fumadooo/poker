'use client';

import { PlayingCard } from './PlayingCard';
import { fmtCents } from '@/lib/client/money';
import type { HandResult } from '@/lib/client/types';

export function ShowdownOverlay({ result, board, nick, onClose }: { result: HandResult; board: string[]; nick: (seat: number | undefined) => string; onClose: () => void }) {
  const winnerSeats = new Set(result.winners.map((w) => w.seat));
  return (
    <div className="fade-in absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-label="Resultado da mão">
      <div className="panel w-full max-w-sm bg-[#101412]/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-white/60">
          {result.shown.length ? 'Showdown' : 'Fim da mão'}
        </div>
        {board.length > 0 && (
          <div className="mb-3 flex justify-center gap-1">
            {board.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {result.winners.map((w, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-gold/10 px-3 py-2">
              <div>
                <div className="font-semibold text-gold">{nick(w.seat)} ganha {fmtCents(w.amount)}</div>
                {w.hand && <div className="text-xs text-white/70">{w.hand}</div>}
              </div>
              <span className="text-2xl">🏆</span>
            </li>
          ))}
        </ul>
        {result.shown.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {result.shown.map((s) => (
              <li key={s.seat} className={`flex items-center gap-3 rounded-lg px-3 py-1.5 ${winnerSeats.has(s.seat) ? 'bg-white/5' : 'opacity-70'}`}>
                <div className="flex gap-1">{s.hole.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{nick(s.seat)}</div>
                  <div className="truncate text-xs text-white/60">{s.hand}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {result.rake > 0 && <div className="mt-3 text-center text-[11px] text-white/40">Rake {fmtCents(result.rake)}</div>}
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
