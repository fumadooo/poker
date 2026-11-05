import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startHand, legalActions, applyAction, applyTimeout, publicView, prngFromSeed, deckFromSeed, newDeck,
  type HandState, type SeatIn, type TableConfig, type Card,
} from '../index.js';

const cfg: TableConfig = { sb: 50, bb: 100, maxSeats: 9, rakeBps: 500, rakeCap: null, noFlopNoDrop: true, actionSeconds: 20 };
const NOW = 1_700_000_000_000;
const rng = () => prngFromSeed('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');

function seats(...stacks: number[]): SeatIn[] {
  return stacks.map((stack, i) => ({ seat: i, playerId: 'p' + i, stack }));
}

/** Force hole cards and the board (deck = remaining board cards + rest) for deterministic showdowns. */
function rig(s: HandState, holes: Record<number, [Card, Card]>, board: Card[]): HandState {
  const v = structuredClone(s);
  const used = new Set<Card>();
  for (const p of v.players) {
    const h = holes[p.seat];
    if (h) { p.hole = [...h]; h.forEach((c) => used.add(c)); }
  }
  board.forEach((c) => used.add(c));
  for (const p of v.players) if (!holes[p.seat] && p.hole.length) p.hole.forEach((c) => used.add(c));
  v.deck = board.slice(v.board.length).concat(newDeck().filter((c) => !used.has(c)));
  return v;
}

const sum = (s: HandState) => s.players.reduce((a, p) => a + p.stack, 0);
const P = (s: HandState, seat: number) => s.players.find((p) => p.seat === seat)!;

test('heads-up: button posts SB and acts first preflop, BB acts first postflop', () => {
  const s = startHand(cfg, seats(10000, 10000), 1, null, NOW, rng());
  assert.equal(s.button, 0);
  assert.equal(s.sbSeat, 0);
  assert.equal(s.bbSeat, 1);
  assert.equal(P(s, 0).committed, 50);
  assert.equal(P(s, 1).committed, 100);
  assert.equal(s.toAct, 0);
  assert.equal(s.currentBet, 100);
  assert.equal(s.minRaise, 100);
  assert.equal(s.deadlineAt, NOW + 20_000);
  assert.equal(P(s, 0).hole.length, 2);
  assert.equal(s.deck.length, 48);
  const la = legalActions(s, 0)!;
  assert.deepEqual(la, { seat: 0, fold: true, check: false, call: 50, bet: null, raise: { min: 200, max: 10000 }, allin: 9950 });
  assert.equal(legalActions(s, 1), null);
  // button calls, BB has the option
  let t = applyAction(s, 0, 'call', undefined, NOW + 1000);
  assert.equal(t.toAct, 1);
  assert.equal(t.street, 'preflop');
  assert.ok(legalActions(t, 1)!.check);
  t = applyAction(t, 1, 'check', undefined, NOW + 2000);
  assert.equal(t.street, 'flop');
  assert.equal(t.board.length, 3);
  assert.equal(t.toAct, 1, 'BB (non-button) acts first postflop heads-up');
  assert.equal(t.currentBet, 0);
  assert.equal(P(t, 0).committed, 0);
  assert.deepEqual(t.pots, [{ amount: 200, eligible: [0, 1] }]);
  // next hand: button moves
  const s2 = startHand(cfg, seats(10000, 10000), 2, s.button, NOW, rng());
  assert.equal(s2.button, 1);
  assert.equal(s2.sbSeat, 1);
  assert.equal(s2.bbSeat, 0);
});

test('3+ players: SB left of button, BB next, UTG first; button rotates over empty seats', () => {
  const sIn: SeatIn[] = [{ seat: 1, playerId: 'a', stack: 5000 }, { seat: 4, playerId: 'b', stack: 5000 }, { seat: 7, playerId: 'c', stack: 5000 }];
  const s = startHand(cfg, sIn, 1, 2, NOW, rng());
  assert.equal(s.button, 4);
  assert.equal(s.sbSeat, 7);
  assert.equal(s.bbSeat, 1);
  assert.equal(s.toAct, 4, 'UTG = button in 3-handed');
  const s2 = startHand(cfg, sIn, 2, 7, NOW, rng());
  assert.equal(s2.button, 1);
});

test('min-raise rule: raise sets the next minimum; raise must be >= last increment', () => {
  let s = startHand(cfg, seats(10000, 10000, 10000), 1, null, NOW, rng());
  assert.equal(s.toAct, 0); // button is UTG 3-handed
  assert.deepEqual(legalActions(s, 0)!.raise, { min: 200, max: 10000 });
  assert.throws(() => applyAction(s, 0, 'raise', 150, NOW), /ILLEGAL_ACTION/);
  s = applyAction(s, 0, 'raise', 300, NOW); // raise to 300 (increment 200)
  assert.equal(s.currentBet, 300);
  assert.equal(s.minRaise, 200);
  assert.equal(s.toAct, 1);
  assert.deepEqual(legalActions(s, 1)!.raise, { min: 500, max: 10000 });
  assert.throws(() => applyAction(s, 1, 'raise', 400, NOW), /ILLEGAL_ACTION: raise to 400 outside/);
  s = applyAction(s, 1, 'raise', 1000, NOW); // increment 700
  assert.equal(s.minRaise, 700);
  assert.deepEqual(legalActions(s, 2)!.raise, { min: 1700, max: 10000 });
  s = applyAction(s, 2, 'fold', undefined, NOW);
  assert.equal(s.toAct, 0);
  assert.deepEqual(legalActions(s, 0)!.raise, { min: 1700, max: 10000 }, 'original raiser may re-raise after a full raise');
  s = applyAction(s, 0, 'call', undefined, NOW);
  assert.equal(s.street, 'flop');
  assert.equal(s.toAct, 1, 'SB acts first on the flop');
  assert.equal(s.minRaise, 100, 'min bet resets to bb');
  assert.deepEqual(legalActions(s, 1)!.bet, { min: 100, max: 9000 });
  assert.throws(() => applyAction(s, 1, 'bet', 99, NOW), /ILLEGAL_ACTION/);
  assert.throws(() => applyAction(s, 1, 'raise', 500, NOW), /ILLEGAL_ACTION/);
});

test('short all-in does not reopen action for players who already acted; it does for those who have not', () => {
  // seat0 button, seat1 SB, seat2 BB, seat3 UTG with tiny stack
  let s = startHand(cfg, seats(10000, 10000, 10000, 10000), 1, null, NOW, rng());
  assert.equal(s.toAct, 3);
  s = applyAction(s, 3, 'raise', 300, NOW); // UTG raises to 300
  s = applyAction(s, 0, 'call', undefined, NOW); // button calls 300
  s = applyAction(s, 1, 'fold', undefined, NOW);
  // BB goes all-in... make BB short: rig stack
  s = structuredClone(s);
  P(s, 2).stack = 350; // BB has 350 behind, 100 committed => all-in to 450, increment 150 < minRaise 200
  s = applyAction(s, 2, 'allin', undefined, NOW);
  assert.equal(s.currentBet, 450);
  assert.equal(s.minRaise, 200, 'short all-in keeps the min-raise');
  assert.equal(s.toAct, 3);
  const la3 = legalActions(s, 3)!;
  assert.equal(la3.call, 150);
  assert.equal(la3.raise, null, 'UTG already acted: may only call or fold');
  assert.ok(la3.allin > 0);
  s = applyAction(s, 3, 'call', undefined, NOW);
  assert.equal(s.toAct, 0);
  assert.equal(legalActions(s, 0)!.raise, null, 'button already acted too');
  s = applyAction(s, 0, 'call', undefined, NOW);
  assert.equal(s.street, 'flop');
  assert.equal(P(s, 2).allIn, true);
  assert.equal(s.toAct, 3, 'first player left of the button still in and not all-in');
});

test('full all-in raise reopens action', () => {
  // seat0 button, seat1 SB, seat2 BB, seat3 UTG
  let s = startHand(cfg, seats(10000, 10000, 10000, 10000), 1, null, NOW, rng());
  s = applyAction(s, 3, 'raise', 300, NOW);
  s = applyAction(s, 0, 'call', undefined, NOW);
  s = structuredClone(s);
  P(s, 1).stack = 500; // SB: 50 committed, 500 behind => all-in to 550, increment 250 >= 200
  s = applyAction(s, 1, 'allin', undefined, NOW);
  assert.equal(s.currentBet, 550);
  assert.equal(s.minRaise, 250);
  s = applyAction(s, 2, 'fold', undefined, NOW);
  assert.equal(s.toAct, 3);
  assert.deepEqual(legalActions(s, 3)!.raise, { min: 800, max: 10000 }, 'UTG may re-raise after a full all-in raise');
  s = applyAction(s, 3, 'call', undefined, NOW);
  assert.deepEqual(legalActions(s, 0)!.raise, { min: 800, max: 10000 }, 'button may re-raise too (UTG can still respond)');
  assert.equal(legalActions(s, 0)!.call, 250);
  s = applyAction(s, 0, 'call', undefined, NOW);
  assert.equal(s.street, 'flop');
  assert.deepEqual(s.pots, [{ amount: 1750, eligible: [0, 1, 3] }]);
});

test('when no opponent can act (all others all-in) bet/raise are not offered', () => {
  let s = startHand(cfg, seats(10000, 10000), 1, null, NOW, rng());
  s = structuredClone(s);
  P(s, 1).stack = 400; // BB short: all-in to 500 is a full raise
  s = applyAction(s, 0, 'raise', 300, NOW);
  s = applyAction(s, 1, 'allin', undefined, NOW);
  const la = legalActions(s, 0)!;
  assert.equal(la.raise, null);
  assert.equal(la.bet, null);
  assert.equal(la.call, 200);
  assert.equal(la.fold, true);
});

test('side pots with 3 players of different stacks; rake taken before payout; odd chip to first seat left of button', () => {
  // stacks: seat0 (button) 1000, seat1 (SB) 300, seat2 (BB) 600
  let s = startHand(cfg, seats(1000, 300, 600), 1, null, NOW, rng());
  s = rig(s, { 0: ['2c', '3d'], 1: ['Ah', 'Ad'], 2: ['Kh', 'Kd'] }, ['As', 'Ks', '7h', '8c', '9d']);
  const initial = 1000 + 300 + 600;
  s = applyAction(s, 0, 'allin', undefined, NOW); // 1000
  s = applyAction(s, 1, 'allin', undefined, NOW); // 300 total
  s = applyAction(s, 2, 'allin', undefined, NOW); // 600 total
  assert.equal(s.street, 'ended');
  assert.equal(s.board.length, 5);
  // uncalled 400 returned to seat0 before pots
  assert.deepEqual(s.pots, [
    { amount: 900, eligible: [0, 1, 2] },
    { amount: 600, eligible: [0, 2] },
  ]);
  // rake 5% of 1500 = 75, split proportionally: main 45, side 30
  assert.equal(s.rake, 75);
  const r = s.result!;
  assert.deepEqual(r.winners, [
    { seat: 1, playerId: 'p1', amount: 855, potIndex: 0, hand: 'Three of a Kind, Aces' },
    { seat: 2, playerId: 'p2', amount: 570, potIndex: 1, hand: 'Three of a Kind, Kings' },
  ]);
  assert.equal(P(s, 0).stack, 400);
  assert.equal(P(s, 1).stack, 855);
  assert.equal(P(s, 2).stack, 570);
  assert.equal(sum(s) + s.rake, initial);
  assert.equal(r.shown.length, 3);
  assert.deepEqual(r.stacks, [{ seat: 0, stack: 400 }, { seat: 1, stack: 855 }, { seat: 2, stack: 570 }]);
  assert.equal(s.log.at(-1)!.kind, 'end');
  assert.ok(s.log.some((e) => e.kind === 'rake' && e.amount === 75));
});

test('split pot: odd chip goes to the first seat left of the button', () => {
  // 3 players, seat0 button. seats 1 and 2 tie; pot after rake is odd.
  const c = { ...cfg, rakeBps: 0 };
  let s = startHand(c, seats(1000, 1000, 1000), 1, null, NOW, rng());
  s = rig(s, { 0: ['2c', '3d'], 1: ['Ah', 'Kd'], 2: ['Ad', 'Kh'] }, ['As', 'Ks', '7h', '8c', '9d']);
  s = applyAction(s, 0, 'call', undefined, NOW);
  s = applyAction(s, 1, 'raise', 251, NOW); // raise to 251 -> pot will be 753
  s = applyAction(s, 2, 'call', undefined, NOW);
  s = applyAction(s, 0, 'call', undefined, NOW);
  for (let i = 0; i < 3; i++) { // check down flop/turn/river
    assert.equal(s.toAct, 1);
    s = applyAction(s, 1, 'check', undefined, NOW);
    s = applyAction(s, 2, 'check', undefined, NOW);
    s = applyAction(s, 0, 'check', undefined, NOW);
  }
  assert.equal(s.street, 'ended');
  assert.equal(s.pots[0].amount, 753);
  const w = s.result!.winners;
  assert.equal(w.length, 2);
  assert.deepEqual(w.map((x) => [x.seat, x.amount]), [[1, 377], [2, 376]]);
  assert.equal(sum(s), 3000);
});

test('uncontested pot: no showdown, shown empty, no-flop-no-drop => rake 0 preflop, rake after flop', () => {
  let s = startHand(cfg, seats(1000, 1000, 1000), 1, null, NOW, rng());
  s = applyAction(s, 0, 'raise', 300, NOW);
  s = applyAction(s, 1, 'fold', undefined, NOW);
  s = applyAction(s, 2, 'fold', undefined, NOW);
  assert.equal(s.street, 'ended');
  assert.deepEqual(s.result!.shown, []);
  assert.equal(s.rake, 0);
  // uncalled 200 returned first; the pot is 100 (own) + 50 + 100 = 250
  assert.deepEqual(s.result!.winners, [{ seat: 0, playerId: 'p0', amount: 250, potIndex: 0 }]);
  assert.ok(s.log.some((e) => e.kind === 'payout' && e.seat === 0 && e.amount === 200 && e.data?.uncalled));
  assert.equal(P(s, 0).stack, 1150);
  assert.equal(sum(s), 3000);
  assert.equal(P(s, 0).hole.length, 2, 'winner keeps cards in the full state');

  // same but the hand reaches the flop => rake applies (5% of 600 = 30)
  let t = startHand(cfg, seats(1000, 1000), 1, null, NOW, rng());
  t = applyAction(t, 0, 'raise', 300, NOW);
  t = applyAction(t, 1, 'call', undefined, NOW);
  assert.equal(t.street, 'flop');
  t = applyAction(t, 1, 'bet', 100, NOW);
  t = applyAction(t, 0, 'fold', undefined, NOW);
  assert.equal(t.street, 'ended');
  assert.equal(t.rake, 30);
  assert.equal(P(t, 1).stack, 1000 + 300 - 30, 'uncalled 100 returned, wins 600 minus 30 rake');
  assert.equal(sum(t) + t.rake, 2000);

  // without no-flop-no-drop the preflop fold pays rake
  let u = startHand({ ...cfg, noFlopNoDrop: false }, seats(1000, 1000), 1, null, NOW, rng());
  u = applyAction(u, 0, 'fold', undefined, NOW);
  assert.equal(u.rake, 5); // pot 100 (50 + uncalled 50 returned) => 5
  assert.equal(P(u, 1).stack, 1045);
});

test('everyone all-in from the blinds runs the board out immediately', () => {
  const s = startHand(cfg, seats(30, 70), 1, null, NOW, rng());
  assert.equal(s.street, 'ended');
  assert.equal(s.board.length, 5);
  assert.equal(sum(s) + s.rake, 100);
  assert.equal(s.pots[0].amount, 60, 'BB uncalled 40 returned');
});

test('illegal actions throw ILLEGAL_ACTION and leave the input untouched', () => {
  const s = startHand(cfg, seats(1000, 1000, 1000), 1, null, NOW, rng());
  const snapshot = JSON.stringify(s);
  assert.throws(() => applyAction(s, 1, 'call', undefined, NOW), /^Error: ILLEGAL_ACTION: not seat 1's turn/);
  assert.throws(() => applyAction(s, 0, 'check', undefined, NOW), /^Error: ILLEGAL_ACTION: cannot check/);
  assert.throws(() => applyAction(s, 0, 'bet', 200, NOW), /^Error: ILLEGAL_ACTION/);
  assert.throws(() => applyAction(s, 0, 'raise', undefined, NOW), /^Error: ILLEGAL_ACTION/);
  assert.throws(() => applyAction(s, 0, 'raise', 150.5, NOW), /^Error: ILLEGAL_ACTION/);
  assert.throws(() => applyAction(s, 0, 'raise', 20000, NOW), /^Error: ILLEGAL_ACTION/);
  assert.throws(() => applyAction(s, 0, 'dance' as any, undefined, NOW), /^Error: ILLEGAL_ACTION: unknown action/);
  assert.throws(() => applyAction(s, 9, 'fold', undefined, NOW), /^Error: ILLEGAL_ACTION/);
  assert.equal(JSON.stringify(s), snapshot);
  // after the hand ended
  let e = startHand(cfg, seats(1000, 1000), 1, null, NOW, rng());
  e = applyAction(e, 0, 'fold', undefined, NOW);
  assert.equal(e.street, 'ended');
  assert.throws(() => applyAction(e, 1, 'check', undefined, NOW), /^Error: ILLEGAL_ACTION/);
  assert.equal(legalActions(e, 1), null);
  // startHand validation
  assert.throws(() => startHand(cfg, seats(1000), 1, null, NOW), /NOT_ENOUGH_PLAYERS/);
  assert.throws(() => startHand(cfg, seats(1000, 0), 1, null, NOW), /NOT_ENOUGH_PLAYERS/);
  assert.throws(() => startHand({ ...cfg, sb: 200 }, seats(1000, 1000), 1, null, NOW), /BAD_CONFIG/);
});

test('applyAction never mutates its input (deep)', () => {
  const s = startHand(cfg, seats(1000, 1000), 1, null, NOW, rng());
  const before = JSON.stringify(s);
  const t = applyAction(s, 0, 'raise', 300, NOW + 5);
  assert.equal(JSON.stringify(s), before);
  assert.notEqual(t, s);
  assert.notEqual(t.players, s.players);
  assert.notEqual(t.log, s.log);
  assert.equal(t.log.length, s.log.length + 1);
});

test('timeout: fold when facing a bet, check when possible; no-op before the deadline', () => {
  let s = startHand(cfg, seats(1000, 1000, 1000), 1, null, NOW, rng());
  assert.equal(applyTimeout(s, s.deadlineAt! - 1), s, 'same object before the deadline');
  const t = applyTimeout(s, s.deadlineAt!);
  assert.notEqual(t, s);
  assert.equal(P(t, 0).folded, true, 'UTG facing the blind folds on timeout');
  assert.equal(t.toAct, 1);
  assert.equal(t.deadlineAt, s.deadlineAt! + 20_000);
  assert.ok(t.log.some((e) => e.kind === 'timeout' && e.seat === 0 && e.action === 'fold'));
  // SB calls, BB (can check) times out => check => flop
  let u = applyAction(t, 1, 'call', undefined, NOW + 1);
  assert.equal(u.toAct, 2);
  u = applyTimeout(u, u.deadlineAt! + 5);
  assert.equal(u.street, 'flop');
  assert.equal(P(u, 2).folded, false);
  assert.ok(u.log.some((e) => e.kind === 'timeout' && e.seat === 2 && e.action === 'check'));
  // ended hand: no-op
  let e = startHand(cfg, seats(1000, 1000), 1, null, NOW, rng());
  e = applyAction(e, 0, 'fold', undefined, NOW);
  assert.equal(applyTimeout(e, NOW + 999_999), e);
});

test('publicView hides the deck, the seed and other players hole cards; keeps shown cards at showdown', () => {
  let s = startHand(cfg, seats(1000, 1000, 1000), 1, null, NOW, rng());
  const v = publicView(s, 'p1');
  assert.deepEqual(v.deck, []);
  assert.equal(v.seed, '');
  assert.equal(P(v, 1).hole.length, 2);
  assert.equal(P(v, 0).hole.length, 0);
  assert.equal(P(v, 2).hole.length, 0);
  assert.equal(s.deck.length, 46, 'original untouched');
  assert.ok(!JSON.stringify(v).includes(P(s, 0).hole[0]) || P(s, 1).hole.includes(P(s, 0).hole[0]));
  const anon = publicView(s, null);
  assert.ok(anon.players.every((p) => p.hole.length === 0));
  assert.ok(!JSON.stringify(anon.log).includes('"cards"'), 'no cards in the log before showdown');
  // showdown: shown hands become public, folded player stays hidden
  s = applyAction(s, 0, 'fold', undefined, NOW);
  s = applyAction(s, 1, 'allin', undefined, NOW);
  s = applyAction(s, 2, 'call', undefined, NOW);
  assert.equal(s.street, 'ended');
  const w = publicView(s, null);
  assert.equal(P(w, 0).hole.length, 0, 'folded player never shows');
  assert.equal(P(w, 1).hole.length, 2);
  assert.equal(P(w, 2).hole.length, 2);
  assert.equal(w.result!.shown.length, 2);
  assert.equal(w.seed, '', 'seed never published (it would reveal folded hole cards)');
  assert.match(w.seedHash, /^[0-9a-f]{64}$/);
  assert.equal(w.seedHash, createHash('sha256').update(Buffer.from(s.seed, 'hex')).digest('hex'));
  assert.equal(v.seedHash, w.seedHash, 'same commitment during and after the hand');
  // uncontested: winner's cards stay private
  let u = startHand(cfg, seats(1000, 1000), 1, null, NOW, rng());
  u = applyAction(u, 0, 'fold', undefined, NOW);
  assert.equal(P(publicView(u, null), 1).hole.length, 0);
});

test('deck is reproducible from the seed (audit) and seeds differ between hands', () => {
  const a = startHand(cfg, seats(1000, 1000), 1, null, NOW);
  const b = startHand(cfg, seats(1000, 1000), 2, null, NOW);
  assert.match(a.seed, /^[0-9a-f]{64}$/);
  assert.notEqual(a.seed, b.seed);
  const full = deckFromSeed(a.seed);
  // dealt: one card each starting left of the button (seat 1 then seat 0), twice
  assert.deepEqual([P(a, 1).hole[0], P(a, 0).hole[0], P(a, 1).hole[1], P(a, 0).hole[1]], full.slice(0, 4));
  assert.deepEqual(a.deck, full.slice(4));
  const c = startHand(cfg, seats(1000, 1000), 3, null, NOW, prngFromSeed(a.seed));
  const d = startHand(cfg, seats(1000, 1000), 3, null, NOW, prngFromSeed(a.seed));
  assert.equal(c.seed, d.seed);
  assert.deepEqual(c.deck, d.deck);
  assert.notEqual(c.handId, d.handId);
});

test('sitting-out seats stay in players (folded, no cards) and are skipped for blinds/button', () => {
  const sIn: SeatIn[] = [
    { seat: 0, playerId: 'a', stack: 1000, sittingOut: true },
    { seat: 1, playerId: 'b', stack: 1000 },
    { seat: 2, playerId: 'c', stack: 1000 },
    { seat: 3, playerId: 'd', stack: 0 },
  ];
  const s = startHand(cfg, sIn, 1, 0, NOW, rng());
  assert.equal(s.players.length, 4);
  assert.equal(P(s, 0).sittingOut, true);
  assert.equal(P(s, 0).hole.length, 0);
  assert.equal(P(s, 3).folded, true);
  assert.equal(s.button, 1);
  assert.equal(s.sbSeat, 1, 'heads-up among the active players');
  assert.equal(s.bbSeat, 2);
  assert.equal(s.toAct, 1);
  assert.equal(s.result, null);
  assert.deepEqual(s.pots, [{ amount: 100, eligible: [1, 2] }, { amount: 50, eligible: [2] }]);
});

test('BB option preflop with 3 players: limps around, BB may raise', () => {
  let s = startHand(cfg, seats(1000, 1000, 1000), 1, null, NOW, rng());
  s = applyAction(s, 0, 'call', undefined, NOW);
  s = applyAction(s, 1, 'call', undefined, NOW);
  assert.equal(s.toAct, 2);
  const la = legalActions(s, 2)!;
  assert.equal(la.check, true);
  assert.deepEqual(la.raise, { min: 200, max: 1000 });
  s = applyAction(s, 2, 'raise', 400, NOW);
  assert.equal(s.toAct, 0);
  assert.equal(s.street, 'preflop');
  s = applyAction(s, 0, 'call', undefined, NOW);
  s = applyAction(s, 1, 'call', undefined, NOW);
  assert.equal(s.street, 'flop');
  assert.equal(s.pots[0].amount, 1200);
});
