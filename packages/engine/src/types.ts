// Contract: docs/SPEC-contracts-v1.md §1 — names and shapes are fixed; do not rename.
// Money is always integer cents. Cards are "As", "Td", "2c" (rank 2..9,T,J,Q,K,A; suit s,h,d,c).

export type Card = string; // "As"
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface TableConfig {
  sb: number;
  bb: number;
  maxSeats: number;
  rakeBps: number;
  /** absolute cap in cents (null = no cap) */
  rakeCap: number | null;
  noFlopNoDrop: boolean;
  actionSeconds: number;
}

export interface SeatIn { seat: number; playerId: string; stack: number; sittingOut?: boolean }

export interface PlayerState {
  seat: number;
  playerId: string;
  stack: number;
  /** committed on the current street */
  committed: number;
  /** committed over the whole hand (drives side pots) */
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  hole: Card[];
  sittingOut: boolean;
  /** has acted since the last full bet/raise on this street */
  acted: boolean;
}

export interface Pot { amount: number; eligible: number[] /* seats */ }

export interface HandState {
  handId: string;
  handNo: number;
  config: TableConfig;
  street: Street;
  /** undealt cards (stripped by publicView) */
  deck: Card[];
  board: Card[];
  players: PlayerState[];
  button: number;
  sbSeat: number;
  bbSeat: number;
  toAct: number | null; // seat
  currentBet: number;
  minRaise: number;
  lastAggressor: number | null;
  pots: Pot[];
  rake: number;
  deadlineAt: number | null; // epoch ms
  log: HandEvent[];
  result: HandResult | null;
  /** 32-byte hex RNG seed (deck = FisherYates(newDeck, prngFromSeed(seed))); hidden by publicView until ended */
  seed: string;
}

export interface HandEvent {
  t: number;
  kind: 'start' | 'blind' | 'deal' | 'action' | 'street' | 'showdown' | 'payout' | 'rake' | 'end' | 'timeout';
  seat?: number;
  action?: ActionKind;
  amount?: number;
  street?: Street;
  cards?: Card[];
  data?: any;
}

export interface HandResult {
  winners: { seat: number; playerId: string; amount: number; potIndex: number; hand?: string }[];
  rake: number;
  shown: { seat: number; hole: Card[]; hand: string }[];
  stacks: { seat: number; stack: number }[];
}

export interface LegalActions {
  seat: number;
  fold: boolean;
  check: boolean;
  /** chips to put in to call (capped at stack), or null when there is nothing to call */
  call: number | null;
  /** bet size range (chips put in on this street), or null when there is already a bet */
  bet: { min: number; max: number } | null;
  /** raise-TO range (total committed on this street after the raise), or null */
  raise: { min: number; max: number } | null;
  /** chips an all-in would put in (= stack) */
  allin: number;
}
