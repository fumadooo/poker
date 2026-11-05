'use client';

import { PlayingCard } from './PlayingCard';
import { Timer } from './Timer';
import { fmtCentsShort } from '@/lib/client/money';
import type { PlayerState, SeatRow } from '@/lib/client/types';

export interface SeatProps {
  seat: number;
  row: SeatRow | null; // quem está sentado (entre mãos: stack_cents é a verdade)
  player: PlayerState | null; // estado na mão corrente
  isMe: boolean;
  isButton: boolean;
  isSB: boolean;
  isBB: boolean;
  toAct: boolean;
  deadlineAt: number | null;
  actionSeconds: number;
  shownHole?: string[]; // cartas mostradas no showdown
  isWinner: boolean;
  handInProgress: boolean;
  canSit: boolean;
  onSit: (seat: number) => void;
  style: React.CSSProperties;
}

export function Seat(p: SeatProps) {
  const { seat, row, player, isMe, toAct } = p;
  const nick = row?.nick || (isMe ? 'Você' : `Jogador ${seat + 1}`);
  const stack = player ? player.stack : row?.stack_cents ?? 0;

  if (!row) {
    return (
      <div style={p.style} className="absolute -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          disabled={!p.canSit}
          onClick={() => p.onSit(seat)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-white/30 bg-black/30 text-[11px] font-medium text-white/70 transition hover:border-gold hover:text-gold disabled:opacity-40 disabled:hover:border-white/30 disabled:hover:text-white/70 sm:h-16 sm:w-16"
          aria-label={`Sentar no assento ${seat + 1}`}
        >
          Sentar
        </button>
      </div>
    );
  }

  const folded = player?.folded ?? false;
  const inHand = !!player && !folded && p.handInProgress;
  const holes: (string | null)[] = p.shownHole?.length ? p.shownHole : player?.hole?.length ? player.hole : inHand ? [null, null] : [];
  const faceDown = !p.shownHole?.length && !(player?.hole?.length);

  return (
    <div style={p.style} className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${folded ? 'opacity-50' : ''}`}>
      {/* cartas */}
      {holes.length > 0 && (
        <div className={`mb-[-10px] flex gap-0.5 ${isMe ? 'z-10' : ''}`}>
          {holes.map((c, i) => (
            <PlayingCard key={i} card={c} faceDown={faceDown} size={isMe ? 'md' : 'sm'} className={i === 1 ? '-ml-2 rotate-6' : '-rotate-6'} />
          ))}
        </div>
      )}
      {/* avatar + timer */}
      <div className="relative" style={{ width: 64, height: 64 }}>
        <div
          className={`absolute inset-[5px] flex items-center justify-center rounded-full border-2 text-lg font-bold uppercase ${
            isMe ? 'border-gold bg-[#2a2410] text-gold' : 'border-white/20 bg-[#1a1d1b] text-white/80'
          } ${toAct ? 'seat-active' : ''} ${p.isWinner ? 'ring-4 ring-yellow-300/80' : ''}`}
        >
          {nick.slice(0, 1)}
        </div>
        {toAct && p.deadlineAt != null && <Timer deadlineAt={p.deadlineAt} totalMs={p.actionSeconds * 1000} size={64} stroke={4} />}
        {p.isButton && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-black shadow" title="Dealer">
            D
          </span>
        )}
        {(p.isSB || p.isBB) && !p.isButton && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#3b4b63] text-[9px] font-bold text-white shadow" title={p.isBB ? 'Big blind' : 'Small blind'}>
            {p.isBB ? 'BB' : 'SB'}
          </span>
        )}
        {(p.isSB || p.isBB) && p.isButton && (
          <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#3b4b63] text-[9px] font-bold text-white shadow">
            {p.isBB ? 'BB' : 'SB'}
          </span>
        )}
      </div>
      {/* nome + stack */}
      <div className={`-mt-1 min-w-[74px] rounded-lg px-2 py-1 text-center shadow ${isMe ? 'bg-[#2a2410]' : 'bg-black/70'}`}>
        <div className="max-w-[90px] truncate text-[11px] font-semibold leading-tight">{nick}</div>
        <div className={`text-[12px] font-bold leading-tight ${player?.allIn ? 'text-red-300' : 'text-gold'}`}>
          {player?.allIn ? 'ALL-IN' : fmtCentsShort(stack)}
        </div>
        {row.status === 'sitout' && <div className="text-[10px] text-white/50">ausente</div>}
        {folded && p.handInProgress && <div className="text-[10px] text-white/50">desistiu</div>}
      </div>
    </div>
  );
}
