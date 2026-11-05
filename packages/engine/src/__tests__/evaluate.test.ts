import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate7, categoryOfRank } from '../index.js';

const e = (s: string) => evaluate7(s.split(' '));

test('category ladder: each row beats the next', () => {
  const ladder: [string, string, number][] = [
    ['As Ks Qs Js Ts 2d 3c', 'Royal Flush', 8],
    ['9h 8h 7h 6h 5h Ad Kc', 'Straight Flush, Nine high', 8],
    ['Ah Ad As Ac Kd 2c 3c', 'Four of a Kind, Aces', 7],
    ['Ah Ad As Kc Kd 2c 3c', 'Full House, Aces over Kings', 6],
    ['Ah Jh 9h 5h 2h Kc Qd', 'Flush, Ace high', 5],
    ['Ah Kd Qs Jc Th 2c 3c', 'Straight, Ace high', 4],
    ['Qh Qd Qs 9c 7h 2c 3c', 'Three of a Kind, Queens', 3],
    ['Ah Ad Ks Kc 7h 2c 3c', 'Two Pair, Aces and Kings', 2],
    ['Jh Jd 9s 7c 5h 2c 3c', 'Pair of Jacks', 1],
    ['Ah Kd 9s 7c 5h 2c 3d', 'High Card, Ace', 0],
  ];
  for (let i = 0; i < ladder.length; i++) {
    const [cards, name, cat] = ladder[i];
    const r = e(cards);
    assert.equal(r.name, name, cards);
    assert.equal(categoryOfRank(r.rank), cat, cards);
    assert.equal(r.best.length, 5);
    if (i > 0) assert.ok(e(ladder[i - 1][0]).rank > r.rank, `${ladder[i - 1][1]} must beat ${name}`);
  }
});

test('ace-low straight (wheel) and its ranking', () => {
  const wheel = e('Ah 2d 3s 4c 5h Kd Qc');
  assert.equal(wheel.name, 'Straight, Five high');
  assert.equal(categoryOfRank(wheel.rank), 4);
  assert.deepEqual(wheel.best, ['5h', '4c', '3s', '2d', 'Ah']);
  const six = e('2h 3d 4s 5c 6h Kd Qc');
  assert.ok(six.rank > wheel.rank, 'six-high straight beats the wheel');
  const broadway = e('Ah Kd Qs Jc Th 2c 3c');
  assert.ok(broadway.rank > six.rank);
  // A-K-Q-J + 2 is NOT a straight (no wraparound)
  const notStraight = e('Ah Kd Qs Jc 2h 7c 8c');
  assert.equal(categoryOfRank(notStraight.rank), 0);
  // steel wheel
  const sw = e('Ah 2h 3h 4h 5h Kd Qc');
  assert.equal(sw.name, 'Straight Flush, Five high');
  assert.equal(categoryOfRank(sw.rank), 8);
  assert.ok(e('9h 8h 7h 6h 5h Ad Kc').rank > sw.rank);
});

test('kicker comparisons', () => {
  // pair of aces, K kicker vs Q kicker
  assert.ok(e('Ah Ad Ks 7c 5h 2c 3d').rank > e('Ah Ad Qs 7c 5h 2c 3d').rank);
  // same pair, same first kicker, differ on 3rd kicker
  assert.ok(e('Ah Ad Ks Qc 9h 2c 3d').rank > e('Ah Ad Ks Qc 8h 2c 3d').rank);
  // high card: 5th card matters
  assert.ok(e('Ah Kd 9s 7c 5h 2c 3d').rank > e('Ah Kd 9s 7c 4h 2c 3d').rank);
  // two pair: higher top pair wins, then second pair, then kicker
  assert.ok(e('Ah Ad 2s 2c 7h 9c 3d').rank > e('Kh Kd Qs Qc 7h 9c 3d').rank);
  assert.ok(e('Ah Ad Ks Kc 2h 9c 3d').rank > e('Ah Ad Qs Qc 7h 9c 3d').rank);
  assert.ok(e('Ah Ad Ks Kc 9h 4c 3d').rank > e('Ah Ad Ks Kc 8h 4c 3d').rank);
  // trips: kicker
  assert.ok(e('Qh Qd Qs Ac 7h 2c 3c').rank > e('Qh Qd Qs Kc 7h 2c 3c').rank);
  // quads: kicker
  assert.ok(e('9h 9d 9s 9c Ah 2c 3c').rank > e('9h 9d 9s 9c Kh 2c 3c').rank);
  // full house: trips rank first, then pair
  assert.ok(e('Qh Qd Qs 2c 2d 7h 8h').rank > e('Jh Jd Js Ac Ad 7h 8h').rank);
  assert.ok(e('Qh Qd Qs Ac Ad 7h 8h').rank > e('Qh Qd Qs Kc Kd 7h 8h').rank);
  // flush: compared card by card
  assert.ok(e('Ah Jh 9h 5h 3h Kc Qd').rank > e('Ah Jh 9h 5h 2h Kc Qd').rank);
  // straight: higher top card wins
  assert.ok(e('Th 9d 8s 7c 6h 2c 3c').rank > e('9h 8d 7s 6c 5h 2c 3c').rank);
});

test('same-rank ties (suits never matter)', () => {
  assert.equal(e('Ah Kd Qs Jc Th 2c 3c').rank, e('Ad Kc Qh Js Td 4c 5c').rank);
  assert.equal(e('Ah Ad Ks 7c 5h 2c 3d').rank, e('As Ac Kd 7h 5d 2s 3s').rank);
  // board plays: both hold nothing better than the board
  const board = 'Ah Kh Qh Jh Th';
  assert.equal(e(board + ' 2c 3c').rank, e(board + ' 4d 5d').rank);
  // 6th/7th card is irrelevant when not used
  assert.equal(e('Ah Kd 9s 7c 5h 2c 3d').rank, e('Ah Kd 9s 7c 5h 2c 4d').rank);
});

test('best 5 picks the right cards out of 7 (two pair out of three pairs, flush over straight)', () => {
  const r = e('Ah Ad Ks Kc 7h 7d 2c');
  assert.equal(r.name, 'Two Pair, Aces and Kings');
  assert.deepEqual(r.best.slice(0, 4).map((c) => c[0]).sort().join(''), 'AAKK');
  assert.equal(r.best[4][0], '7');
  const f = e('Ah 2h 3h 4h 9h 5c 6d'); // flush beats the 6-high straight
  assert.equal(f.name, 'Flush, Ace high');
});

test('evaluate7 input validation', () => {
  assert.throws(() => evaluate7(['Ah', 'Kd', 'Qs', 'Jc']), /EVALUATE_CARDS/);
  assert.throws(() => evaluate7(['Ah', 'Ah', 'Qs', 'Jc', 'Th']), /DUPLICATE_CARD/);
  assert.throws(() => evaluate7(['Ah', 'Xd', 'Qs', 'Jc', 'Th']), /BAD_CARD/);
  assert.equal(evaluate7(['Ah', 'Kd', 'Qs', 'Jc', 'Th']).name, 'Straight, Ace high');
  assert.equal(evaluate7(['Ah', 'Kd', 'Qs', 'Jc', 'Th', '2c']).name, 'Straight, Ace high');
});
