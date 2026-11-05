import { createHash, randomBytes } from 'node:crypto';
import { newDeck, prngFromSeed, randomSeed, seedFromRng, shuffle } from './cards.js';
import { evaluate7 } from './evaluate.js';
import { computeRake } from './rake.js';
import type {
  ActionKind, Card, HandEvent, HandResult, HandState, LegalActions, PlayerState, Pot, SeatIn, Street, TableConfig,
} from './types.js';

const BETTING_STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

function illegal(msg: string): never {
  throw new Error('ILLEGAL_ACTION: ' + msg);
}

function isBetting(street: Street): boolean {
  return BETTING_STREETS.includes(street);
}

/** Player still able to act (in the hand, not all-in, not sitting out). */
function canAct(p: PlayerState): boolean {
  return !p.folded && !p.allIn && !p.sittingOut && p.stack > 0;
}

/** Player must still act on this street. */
function needsAction(p: PlayerState, s: HandState): boolean {
  return canAct(p) && (!p.acted || p.committed < s.currentBet);
}

function inHand(p: PlayerState): boolean {
  return !p.folded && !p.sittingOut;
}

function seatsOf(players: readonly PlayerState[]): number[] {
  return players.map((p) => p.seat).sort((a, b) => a - b);
}

/** Next seat clockwise after `from` in the given ring (wraps). */
function nextSeat(ring: readonly number[], from: number): number {
  for (const s of ring) if (s > from) return s;
  return ring[0];
}

/** Players in clockwise order starting with the first seat left of `from`. */
function fromSeat(players: readonly PlayerState[], from: number): PlayerState[] {
  const sorted = players.slice().sort((a, b) => a.seat - b.seat);
  const after = sorted.filter((p) => p.seat > from);
  const before = sorted.filter((p) => p.seat <= from);
  return after.concat(before);
}

function player(s: HandState, seat: number): PlayerState {
  const p = s.players.find((x) => x.seat === seat);
  if (!p) illegal('unknown seat ' + seat);
  return p;
}

function findNextToAct(s: HandState, from: number): number | null {
  for (const p of fromSeat(s.players, from)) if (needsAction(p, s)) return p.seat;
  return null;
}

/** Move chips from stack to the pot (capped at stack). Returns the amount moved. */
function put(p: PlayerState, n: number): number {
  const a = Math.min(Math.max(0, n), p.stack);
  p.stack -= a;
  p.committed += a;
  p.totalCommitted += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

function reopenAction(s: HandState, aggressor: number): void {
  for (const q of s.players) if (q.seat !== aggressor && canAct(q)) q.acted = false;
}

function ev(s: HandState, e: HandEvent): void {
  s.log.push(e);
}

/** Pots by totalCommitted levels. Folded players' chips stay in; eligibility = non-folded with tc >= level. */
export function computePots(players: readonly PlayerState[]): Pot[] {
  const live = players.filter(inHand);
  const levels = [...new Set(live.map((p) => p.totalCommitted).filter((x) => x > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.totalCommitted, L) - prev);
    const eligible = live.filter((p) => p.totalCommitted >= L).map((p) => p.seat).sort((a, b) => a - b);
    pots.push({ amount, eligible });
    prev = L;
  }
  // chips from folded players above the top live level (rare): they belong to the last pot
  let leftover = 0;
  for (const p of players) leftover += Math.max(0, p.totalCommitted - prev);
  if (leftover > 0) {
    if (pots.length === 0) pots.push({ amount: leftover, eligible: live.map((p) => p.seat) });
    else pots[pots.length - 1].amount += leftover;
  }
  return pots;
}

/** Return the uncalled part of the biggest bet (never raked, never contested). */
function refundUncalled(s: HandState, now: number): void {
  const live = s.players.filter(inHand);
  if (live.length === 0) return;
  let top = live[0];
  for (const p of live) if (p.totalCommitted > top.totalCommitted) top = p;
  let othersMax = 0;
  for (const p of s.players) if (p !== top) othersMax = Math.max(othersMax, p.totalCommitted);
  const refund = top.totalCommitted - othersMax;
  if (refund > 0) {
    top.totalCommitted -= refund;
    top.committed = Math.max(0, top.committed - refund);
    top.stack += refund;
    if (top.stack > 0) top.allIn = false;
    ev(s, { t: now, kind: 'payout', seat: top.seat, amount: refund, data: { uncalled: true } });
  }
}

function finish(s: HandState, now: number, winners: HandResult['winners'], shown: HandResult['shown']): HandState {
  s.street = 'ended';
  s.toAct = null;
  s.deadlineAt = null;
  s.result = {
    winners,
    rake: s.rake,
    shown,
    stacks: s.players.map((p) => ({ seat: p.seat, stack: p.stack })),
  };
  ev(s, { t: now, kind: 'end', data: { stacks: s.result.stacks } });
  return s;
}

/** Split total rake across pots proportionally (remainder to the main pot). */
function rakePerPot(s: HandState, pots: Pot[]): { total: number; perPot: number[] } {
  const totalPot = pots.reduce((a, p) => a + p.amount, 0);
  const sawFlop = s.board.length >= 3;
  const total = computeRake(totalPot, s.config, sawFlop);
  const perPot = pots.map((p) => (totalPot > 0 ? Math.floor((total * p.amount) / totalPot) : 0));
  let assigned = perPot.reduce((a, b) => a + b, 0);
  if (pots.length > 0) perPot[0] += total - assigned;
  return { total, perPot };
}

function payPot(s: HandState, now: number, potIndex: number, payout: number, winnerSeats: number[], hand: string | undefined, winners: HandResult['winners']): void {
  // odd chips: first seat left of the button first
  const ordered = fromSeat(s.players, s.button).filter((p) => winnerSeats.includes(p.seat));
  const n = ordered.length;
  const share = Math.floor(payout / n);
  let rem = payout - share * n;
  for (const p of ordered) {
    const amount = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    p.stack += amount;
    winners.push({ seat: p.seat, playerId: p.playerId, amount, potIndex, ...(hand ? { hand } : {}) });
    ev(s, { t: now, kind: 'payout', seat: p.seat, amount, data: { potIndex } });
  }
}

function finishUncontested(s: HandState, now: number): HandState {
  refundUncalled(s, now);
  s.toAct = null;
  s.deadlineAt = null;
  const winner = s.players.find(inHand)!;
  const pots = computePots(s.players);
  s.pots = pots;
  const { total, perPot } = rakePerPot(s, pots);
  s.rake = total;
  const winners: HandResult['winners'] = [];
  pots.forEach((pot, i) => payPot(s, now, i, pot.amount - perPot[i], [winner.seat], undefined, winners));
  ev(s, { t: now, kind: 'rake', amount: total });
  return finish(s, now, winners, []);
}

function showdown(s: HandState, now: number): HandState {
  refundUncalled(s, now);
  s.street = 'showdown';
  s.toAct = null;
  s.deadlineAt = null;
  const pots = computePots(s.players);
  s.pots = pots;
  const { total, perPot } = rakePerPot(s, pots);
  s.rake = total;

  const evals = new Map<number, { rank: number; name: string; best: Card[] }>();
  const shown: HandResult['shown'] = [];
  for (const p of fromSeat(s.players, s.button)) {
    if (!inHand(p)) continue;
    const e = evaluate7(p.hole.concat(s.board));
    evals.set(p.seat, e);
    shown.push({ seat: p.seat, hole: p.hole.slice(), hand: e.name });
    ev(s, { t: now, kind: 'showdown', seat: p.seat, cards: p.hole.slice(), data: { hand: e.name, best: e.best, rank: e.rank } });
  }

  const winners: HandResult['winners'] = [];
  pots.forEach((pot, i) => {
    let bestRank = -1;
    for (const seat of pot.eligible) bestRank = Math.max(bestRank, evals.get(seat)!.rank);
    const winnerSeats = pot.eligible.filter((seat) => evals.get(seat)!.rank === bestRank);
    const name = evals.get(winnerSeats[0])!.name;
    payPot(s, now, i, pot.amount - perPot[i], winnerSeats, name, winners);
  });
  ev(s, { t: now, kind: 'rake', amount: total });
  return finish(s, now, winners, shown);
}

function dealStreet(s: HandState, now: number, street: Street, count: number): void {
  const cards = s.deck.splice(0, count);
  s.board.push(...cards);
  s.street = street;
  ev(s, { t: now, kind: 'street', street, cards });
}

/** Betting round is over: reset street state and deal on (running the board out when no betting is possible). */
function advanceStreet(s: HandState, now: number): HandState {
  for (;;) {
    for (const p of s.players) { p.committed = 0; p.acted = false; }
    s.currentBet = 0;
    s.minRaise = s.config.bb;
    s.lastAggressor = null;
    s.pots = computePots(s.players);
    if (s.street === 'preflop') dealStreet(s, now, 'flop', 3);
    else if (s.street === 'flop') dealStreet(s, now, 'turn', 1);
    else if (s.street === 'turn') dealStreet(s, now, 'river', 1);
    else return showdown(s, now);
    const actors = s.players.filter(canAct);
    if (actors.length >= 2) {
      s.toAct = findNextToAct(s, s.button);
      s.deadlineAt = now + s.config.actionSeconds * 1000;
      return s;
    }
    s.toAct = null;
    s.deadlineAt = null;
  }
}

function afterAction(s: HandState, seat: number, now: number): HandState {
  s.pots = computePots(s.players);
  const live = s.players.filter(inHand);
  if (live.length === 1) return finishUncontested(s, now);
  const next = findNextToAct(s, seat);
  if (next !== null) {
    s.toAct = next;
    s.deadlineAt = now + s.config.actionSeconds * 1000;
    return s;
  }
  return advanceStreet(s, now);
}

function validateConfig(c: TableConfig): void {
  const ints = [c.sb, c.bb, c.maxSeats, c.rakeBps, c.actionSeconds];
  if (ints.some((x) => !Number.isInteger(x))) throw new Error('BAD_CONFIG: sb, bb, maxSeats, rakeBps, actionSeconds must be integers');
  if (c.sb <= 0 || c.bb <= 0 || c.sb > c.bb) throw new Error('BAD_CONFIG: need 0 < sb <= bb');
  if (c.maxSeats < 2) throw new Error('BAD_CONFIG: maxSeats >= 2');
  if (c.rakeBps < 0 || c.rakeBps > 10000) throw new Error('BAD_CONFIG: rakeBps in 0..10000');
  if (c.rakeCap !== null && (!Number.isInteger(c.rakeCap) || c.rakeCap < 0)) throw new Error('BAD_CONFIG: rakeCap null or integer >= 0');
  if (c.actionSeconds <= 0) throw new Error('BAD_CONFIG: actionSeconds > 0');
}

function newHandId(): string {
  // RFC 4122 v4 from crypto bytes (no dependency on crypto.randomUUID availability in older runtimes)
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Start a hand. Blinds posted, cards dealt, first player to act set (with deadline).
 * Heads-up: the button is the small blind and acts first preflop.
 * Seats with sittingOut or stack 0 are kept in `players` (folded, no cards) so the UI can draw them.
 */
export function startHand(
  config: TableConfig,
  seats: SeatIn[],
  handNo: number,
  prevButton: number | null,
  now: number,
  rng?: () => number,
): HandState {
  validateConfig(config);
  const seen = new Set<number>();
  for (const s of seats) {
    if (!Number.isInteger(s.seat) || s.seat < 0 || s.seat >= config.maxSeats) throw new Error('BAD_SEAT: ' + s.seat);
    if (seen.has(s.seat)) throw new Error('BAD_SEAT: duplicate ' + s.seat);
    if (!Number.isInteger(s.stack) || s.stack < 0) throw new Error('BAD_STACK: seat ' + s.seat);
    seen.add(s.seat);
  }
  const players: PlayerState[] = seats
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((s) => {
      const out = !!s.sittingOut || s.stack <= 0;
      return {
        seat: s.seat, playerId: s.playerId, stack: s.stack, committed: 0, totalCommitted: 0,
        folded: out, allIn: false, hole: [], sittingOut: out, acted: false,
      };
    });
  const active = players.filter((p) => !p.sittingOut);
  if (active.length < 2) throw new Error('NOT_ENOUGH_PLAYERS: need 2 active players with chips');
  const ring = seatsOf(active);
  const button = prevButton === null || prevButton === undefined ? ring[0] : nextSeat(ring, prevButton);
  let sbSeat: number, bbSeat: number;
  if (active.length === 2) {
    sbSeat = button;
    bbSeat = nextSeat(ring, button);
  } else {
    sbSeat = nextSeat(ring, button);
    bbSeat = nextSeat(ring, sbSeat);
  }

  const seed = rng ? seedFromRng(rng) : randomSeed();
  const deck = shuffle(newDeck(), prngFromSeed(seed));

  const s: HandState = {
    handId: newHandId(),
    handNo,
    config: { ...config },
    street: 'preflop',
    deck,
    board: [],
    players,
    button,
    sbSeat,
    bbSeat,
    toAct: null,
    currentBet: 0,
    minRaise: config.bb,
    lastAggressor: null,
    pots: [],
    rake: 0,
    deadlineAt: null,
    log: [],
    result: null,
    seed,
  };
  ev(s, {
    t: now, kind: 'start',
    data: { handNo, button, sbSeat, bbSeat, seats: active.map((p) => ({ seat: p.seat, playerId: p.playerId, stack: p.stack })) },
  });

  // blinds
  const sbP = player(s, sbSeat);
  const sbPaid = put(sbP, config.sb);
  ev(s, { t: now, kind: 'blind', seat: sbSeat, amount: sbPaid, data: { blind: 'sb' } });
  const bbP = player(s, bbSeat);
  const bbPaid = put(bbP, config.bb);
  ev(s, { t: now, kind: 'blind', seat: bbSeat, amount: bbPaid, data: { blind: 'bb' } });
  s.currentBet = config.bb; // a short blind still has to be called up to the full big blind
  s.minRaise = config.bb;

  // deal: one card at a time, starting left of the button
  const order = fromSeat(active, button);
  for (let round = 0; round < 2; round++) for (const p of order) p.hole.push(s.deck.shift()!);
  ev(s, { t: now, kind: 'deal', data: { seats: order.map((p) => p.seat) } });

  s.pots = computePots(s.players);
  const first = findNextToAct(s, bbSeat);
  if (first === null) return advanceStreet(s, now); // everyone all-in from the blinds
  s.toAct = first;
  s.deadlineAt = now + config.actionSeconds * 1000;
  return s;
}

/** Legal actions for `seat`, or null when it is not that seat's turn (or the hand is over). */
export function legalActions(state: HandState, seat: number): LegalActions | null {
  if (!isBetting(state.street) || state.toAct !== seat) return null;
  const p = state.players.find((x) => x.seat === seat);
  if (!p || !canAct(p)) return null;
  const toCall = Math.max(0, state.currentBet - p.committed);
  const call = toCall > 0 ? Math.min(toCall, p.stack) : null;
  const check = toCall === 0;
  const opponentsCanAct = state.players.some((q) => q.seat !== seat && canAct(q));

  let bet: LegalActions['bet'] = null;
  let raise: LegalActions['raise'] = null;
  if (opponentsCanAct) {
    if (state.currentBet === 0) {
      bet = { min: Math.min(state.config.bb, p.stack), max: p.stack };
    } else if (!p.acted) {
      const maxTo = p.committed + p.stack;
      const minTo = state.currentBet + state.minRaise;
      if (maxTo >= minTo) raise = { min: minTo, max: maxTo };
    }
  }
  return { seat, fold: true, check, call, bet, raise, allin: p.stack };
}

/**
 * Apply one action. Throws Error('ILLEGAL_ACTION: ...') when not legal. Never mutates `state`.
 * `amount` semantics: bet = chips to put in on this street; raise = raise-TO total on this street.
 */
export function applyAction(state: HandState, seat: number, action: ActionKind, amount: number | undefined, now: number): HandState {
  if (!isBetting(state.street)) illegal('hand is not in a betting street (' + state.street + ')');
  if (state.toAct !== seat) illegal('not seat ' + seat + "'s turn (toAct=" + state.toAct + ')');
  const la = legalActions(state, seat);
  if (!la) illegal('seat ' + seat + ' cannot act');

  const s = structuredClone(state);
  const p = player(s, seat);
  let logged: number | undefined;

  switch (action) {
    case 'fold':
      p.folded = true;
      p.acted = true;
      break;
    case 'check':
      if (!la.check) illegal('cannot check facing a bet of ' + s.currentBet);
      p.acted = true;
      break;
    case 'call':
      if (la.call === null) illegal('nothing to call');
      logged = put(p, la.call);
      p.acted = true;
      break;
    case 'bet': {
      if (!la.bet) illegal(s.currentBet > 0 ? 'there is already a bet; use raise' : 'no opponent can act');
      if (amount === undefined || !Number.isInteger(amount)) illegal('bet needs an integer amount');
      if (amount < la.bet.min || amount > la.bet.max) illegal(`bet ${amount} outside [${la.bet.min}, ${la.bet.max}]`);
      put(p, amount);
      const full = p.committed >= s.minRaise;
      if (full) { s.minRaise = p.committed; reopenAction(s, seat); }
      s.currentBet = p.committed;
      s.lastAggressor = seat;
      p.acted = true;
      logged = p.committed;
      break;
    }
    case 'raise': {
      if (!la.raise) illegal(s.currentBet === 0 ? 'nothing to raise; use bet' : 'raise not available (short stack, already acted after a short all-in, or no opponent can act)');
      if (amount === undefined || !Number.isInteger(amount)) illegal('raise needs an integer raise-to amount');
      if (amount < la.raise.min || amount > la.raise.max) illegal(`raise to ${amount} outside [${la.raise.min}, ${la.raise.max}]`);
      const inc = amount - s.currentBet;
      put(p, amount - p.committed);
      s.minRaise = inc; // a raise in range is always a full raise
      reopenAction(s, seat);
      s.currentBet = p.committed;
      s.lastAggressor = seat;
      p.acted = true;
      logged = p.committed;
      break;
    }
    case 'allin': {
      if (p.stack <= 0) illegal('no chips');
      put(p, p.stack);
      if (p.committed > s.currentBet) {
        const inc = p.committed - s.currentBet;
        if (inc >= s.minRaise) { s.minRaise = inc; reopenAction(s, seat); } // short all-in does not reopen action
        s.currentBet = p.committed;
        s.lastAggressor = seat;
      }
      p.acted = true;
      logged = p.committed;
      break;
    }
    default:
      illegal('unknown action ' + String(action));
  }
  ev(s, { t: now, kind: 'action', seat, action, amount: logged, street: s.street, data: { stack: p.stack, committed: p.committed } });
  return afterAction(s, seat, now);
}

/** If the deadline has passed: check when possible, otherwise fold. Returns the same object when nothing to do. */
export function applyTimeout(state: HandState, now: number): HandState {
  if (!isBetting(state.street) || state.toAct === null || state.deadlineAt === null) return state;
  if (state.deadlineAt > now) return state;
  const seat = state.toAct;
  const la = legalActions(state, seat);
  if (!la) return state;
  const action: ActionKind = la.check ? 'check' : 'fold';
  const marked = structuredClone(state);
  marked.log.push({ t: now, kind: 'timeout', seat, action, data: { deadlineAt: state.deadlineAt } });
  return applyAction(marked, seat, action, undefined, now);
}

/** sha256 (hex) of the seed bytes: the public commitment of the hand's RNG. The seed itself stays server-side. */
export function seedHashOf(seed: string): string {
  return /^(?:[0-9a-f]{2})+$/.test(seed) ? createHash('sha256').update(Buffer.from(seed, 'hex')).digest('hex') : '';
}

export type PublicHandState = HandState & { seedHash: string };

/**
 * Copy of the state safe to send to a client: no deck, NEVER the seed (the deck order would reveal folded and
 * mucked hole cards), `seedHash` instead; only the viewer's hole cards (+ shown at showdown).
 */
export function publicView(state: HandState, viewerPlayerId: string | null): PublicHandState {
  const v = structuredClone(state) as PublicHandState;
  v.deck = [];
  v.seedHash = seedHashOf(state.seed);
  v.seed = '';
  const shownSeats = new Set((v.result?.shown ?? []).map((x) => x.seat));
  for (const p of v.players) {
    if (p.playerId === viewerPlayerId) continue;
    if (shownSeats.has(p.seat)) continue;
    p.hole = [];
  }
  // log events never carry private cards (deal has no cards; showdown cards are public)
  return v;
}
