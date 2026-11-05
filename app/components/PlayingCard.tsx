'use client';

const RANKS: Record<string, string> = { T: '10' };
const SUITS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

const SIZES = {
  sm: 'w-7 h-10 text-[11px] p-[3px]',
  md: 'w-10 h-14 text-sm p-1',
  lg: 'w-12 h-[68px] text-base p-1.5',
} as const;

export type CardSize = keyof typeof SIZES;

export function PlayingCard({ card, faceDown, size = 'md', className = '' }: { card?: string | null; faceDown?: boolean; size?: CardSize; className?: string }) {
  const sz = SIZES[size];
  if (faceDown || !card) {
    return <span aria-label="carta virada" className={`card card-back ${sz} ${className}`} />;
  }
  const rank = RANKS[card[0]] ?? card[0];
  const suit = card[1];
  return (
    <span aria-label={`${rank}${SUITS[suit] ?? ''}`} className={`card suit-${suit} ${sz} ${className}`}>
      <span className="leading-none">{rank}</span>
      <span className="self-end leading-none">{SUITS[suit] ?? '?'}</span>
    </span>
  );
}

/** Texto curto de cartas para o histórico: ["Ah","7d"] → "A♥ 7♦" */
export function cardsText(cards: string[] | undefined): string {
  return (cards ?? []).map((c) => (RANKS[c[0]] ?? c[0]) + (SUITS[c[1]] ?? '')).join(' ');
}
