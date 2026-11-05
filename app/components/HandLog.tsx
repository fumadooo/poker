'use client';

import { useEffect, useRef } from 'react';
import { cardsText } from './PlayingCard';
import { fmtCentsShort } from '@/lib/client/money';
import type { HandEvent } from '@/lib/client/types';

const STREET: Record<string, string> = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', ended: 'Fim' };

export function describeEvent(e: HandEvent, nick: (seat: number | undefined) => string): string {
  const who = nick(e.seat);
  const amt = e.amount != null ? fmtCentsShort(e.amount) : '';
  switch (e.kind) {
    case 'start': {
      const d = e.data as { handNo?: number } | undefined;
      return `Mão${d?.handNo != null ? ` #${d.handNo}` : ''} começou`;
    }
    case 'blind': return `${who} posta blind ${amt}`;
    case 'deal': return e.cards?.length ? `Suas cartas: ${cardsText(e.cards)}` : 'Cartas distribuídas';
    case 'action':
      switch (e.action) {
        case 'fold': return `${who} desistiu`;
        case 'check': return `${who} passou`;
        case 'call': return `${who} pagou ${amt}`;
        case 'bet': return `${who} apostou ${amt}`;
        case 'raise': return `${who} aumentou para ${amt}`;
        case 'allin': return `${who} foi all-in ${amt}`;
        default: return `${who} ${e.action ?? ''}`;
      }
    case 'street': return `${STREET[e.street ?? ''] ?? e.street}: ${cardsText(e.cards)}`;
    case 'showdown': {
      const list = Array.isArray(e.data) ? (e.data as { seat: number; hole?: string[]; hand?: string }[]) : [];
      return list.length ? 'Showdown — ' + list.map((s) => `${nick(s.seat)}: ${cardsText(s.hole)}${s.hand ? ` (${s.hand})` : ''}`).join('; ') : 'Showdown';
    }
    case 'payout': return `${who} ganha ${amt}`;
    case 'rake': return `Rake ${amt}`;
    case 'end': return 'Mão encerrada';
    case 'timeout': return `${who} estourou o tempo`;
    default: return e.kind;
  }
}

export function HandLog({ events, nick, className = '' }: { events: HandEvent[]; nick: (seat: number | undefined) => string; className?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [events.length]);
  return (
    <div className={`panel flex min-h-0 flex-col ${className}`}>
      <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Histórico da mão</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-5 text-white/85">
        {events.length === 0 && <div className="text-white/40">Nenhuma mão em curso.</div>}
        {events.map((e, i) => (
          <div key={i} className={e.kind === 'street' || e.kind === 'showdown' || e.kind === 'payout' ? 'text-gold' : ''}>
            {describeEvent(e, nick)}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
