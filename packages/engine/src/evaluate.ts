import { rankValue, suitOf } from './cards.js';
import type { Card } from './types.js';

// Categories (higher = better)
export const CAT_HIGH = 0;
export const CAT_PAIR = 1;
export const CAT_TWO_PAIR = 2;
export const CAT_TRIPS = 3;
export const CAT_STRAIGHT = 4;
export const CAT_FLUSH = 5;
export const CAT_FULL_HOUSE = 6;
export const CAT_QUADS = 7;
export const CAT_STRAIGHT_FLUSH = 8;

const SINGULAR = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const PLURAL = ['', '', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export interface Eval5 { cat: number; tie: number[]; rank: number }

/** Packs category + 5 tiebreak values (each 0..14) into one comparable integer. */
function pack(cat: number, tie: number[]): number {
  let r = cat;
  for (let i = 0; i < 5; i++) r = r * 15 + (tie[i] ?? 0);
  return r;
}

/** Evaluate exactly 5 cards. */
export function evaluate5(cards: readonly Card[]): Eval5 {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  // groups ordered by (count desc, rank desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const distinct = groups.map((g) => g[0]);

  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straightHigh = 5; // wheel A-2-3-4-5
  }

  let cat: number;
  let tie: number[];
  if (straightHigh && flush) { cat = CAT_STRAIGHT_FLUSH; tie = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = CAT_QUADS; tie = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = CAT_FULL_HOUSE; tie = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = CAT_FLUSH; tie = vals; }
  else if (straightHigh) { cat = CAT_STRAIGHT; tie = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = CAT_TRIPS; tie = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = CAT_TWO_PAIR; tie = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2) { cat = CAT_PAIR; tie = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]; }
  else { cat = CAT_HIGH; tie = vals; }
  return { cat, tie, rank: pack(cat, tie) };
}

export function handName(e: Eval5): string {
  const t = e.tie;
  switch (e.cat) {
    case CAT_STRAIGHT_FLUSH: return t[0] === 14 ? 'Royal Flush' : `Straight Flush, ${SINGULAR[t[0]]} high`;
    case CAT_QUADS: return `Four of a Kind, ${PLURAL[t[0]]}`;
    case CAT_FULL_HOUSE: return `Full House, ${PLURAL[t[0]]} over ${PLURAL[t[1]]}`;
    case CAT_FLUSH: return `Flush, ${SINGULAR[t[0]]} high`;
    case CAT_STRAIGHT: return `Straight, ${SINGULAR[t[0]]} high`;
    case CAT_TRIPS: return `Three of a Kind, ${PLURAL[t[0]]}`;
    case CAT_TWO_PAIR: return `Two Pair, ${PLURAL[t[0]]} and ${PLURAL[t[1]]}`;
    case CAT_PAIR: return `Pair of ${PLURAL[t[0]]}`;
    default: return `High Card, ${SINGULAR[t[0]]}`;
  }
}

/** Category name only ("Full House", "Flush", ...) — handy for stats. */
export function categoryName(cat: number): string {
  return ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'][cat] ?? 'Unknown';
}

/** Sort cards so that grouped ranks come first (count desc, rank desc) — the way a hand is read. */
function orderBest(cards: Card[], e: Eval5): Card[] {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankValue(c), (counts.get(rankValue(c)) ?? 0) + 1);
  const wheel = (e.cat === CAT_STRAIGHT || e.cat === CAT_STRAIGHT_FLUSH) && e.tie[0] === 5;
  return cards.slice().sort((a, b) => {
    let va = rankValue(a), vb = rankValue(b);
    if (wheel) { if (va === 14) va = 1; if (vb === 14) vb = 1; }
    return (counts.get(rankValue(b))! - counts.get(rankValue(a))!) || vb - va;
  });
}

/**
 * Best 5-card hand out of 5..7 cards. `rank` is comparable across hands (higher wins, equal = tie).
 * `name` e.g. "Full House, Aces over Kings"; `best` = the 5 cards used.
 */
export function evaluate7(cards: Card[]): { rank: number; name: string; best: Card[] } {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error('EVALUATE_CARDS: need 5..7 cards, got ' + n);
  const seen = new Set<string>();
  for (const c of cards) {
    rankValue(c);
    if (seen.has(c)) throw new Error('DUPLICATE_CARD: ' + c);
    seen.add(c);
  }
  let best: Eval5 | null = null;
  let bestCards: Card[] = [];
  const combo: Card[] = new Array(5);
  // enumerate all 5-subsets
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    for (let k = 0; k < 5; k++) combo[k] = cards[idx[k]];
    const e = evaluate5(combo);
    if (best === null || e.rank > best.rank) { best = e; bestCards = combo.slice(); }
    // next combination
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let k = i + 1; k < 5; k++) idx[k] = idx[k - 1] + 1;
  }
  const b = best!;
  return { rank: b.rank, name: handName(b), best: orderBest(bestCards, b) };
}

/** Category (0..8) of a packed rank. */
export function categoryOfRank(rank: number): number {
  return Math.floor(rank / 15 ** 5);
}
