import { randomBytes } from 'node:crypto';
import type { Card } from './types.js';

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

/** Fresh ordered 52-card deck. */
export function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

/** 32 random bytes from node:crypto as 64 hex chars. */
export function randomSeed(): string {
  return randomBytes(32).toString('hex');
}

/** Derive a 32-byte hex seed from an external rng (so the deck stays reproducible from `seed`). */
export function seedFromRng(rng: () => number): string {
  let hex = '';
  for (let i = 0; i < 32; i++) {
    const b = Math.min(255, Math.max(0, Math.floor(rng() * 256)));
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Deterministic PRNG (sfc32) seeded from a 64-hex-char seed. Returns floats in [0, 1).
 * Same seed => same sequence => same shuffle (audit / replay).
 */
export function prngFromSeed(seedHex: string): () => number {
  if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) throw new Error('BAD_SEED: expected 64 hex chars');
  const w = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x6a09e667];
  for (let i = 0; i < 32; i++) {
    const b = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
    const k = i % 4;
    w[k] = (Math.imul(w[k] ^ b, 0x85ebca6b) ^ (w[k] >>> 13)) >>> 0;
  }
  let a = w[0] >>> 0, b = w[1] >>> 0, c = w[2] >>> 0, d = w[3] >>> 0;
  const next = (): number => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i++) next(); // warm-up
  return next;
}

/** Fisher-Yates shuffle (returns a new array; input untouched). */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/** The full shuffled deck a hand used, rebuilt from its seed (audit). */
export function deckFromSeed(seedHex: string): Card[] {
  return shuffle(newDeck(), prngFromSeed(seedHex));
}

export function rankValue(card: Card): number {
  if (typeof card !== 'string' || card.length !== 2) throw new Error('BAD_CARD: ' + card);
  const v = RANKS.indexOf(card[0]);
  if (v < 0 || SUITS.indexOf(card[1]) < 0) throw new Error('BAD_CARD: ' + card);
  return v + 2; // 2..14
}

export function suitOf(card: Card): string {
  return card[1];
}
