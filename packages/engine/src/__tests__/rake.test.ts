import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRake, type TableConfig } from '../index.js';

const base: TableConfig = { sb: 50, bb: 100, maxSeats: 9, rakeBps: 500, rakeCap: null, noFlopNoDrop: true, actionSeconds: 20 };

test('500 bps, no cap', () => {
  assert.equal(computeRake(10000, base, true), 500);
  assert.equal(computeRake(199, base, true), 9); // floor(9.95)
  assert.equal(computeRake(19, base, true), 0); // floor(0.95)
  assert.equal(computeRake(123456, base, true), 6172);
});

test('cap', () => {
  const capped = { ...base, rakeCap: 300 };
  assert.equal(computeRake(10000, capped, true), 300);
  assert.equal(computeRake(2000, capped, true), 100);
  assert.equal(computeRake(10000, { ...base, rakeCap: 0 }, true), 0);
});

test('no flop no drop', () => {
  assert.equal(computeRake(10000, base, false), 0);
  assert.equal(computeRake(10000, { ...base, noFlopNoDrop: false }, false), 500);
});

test('edge values', () => {
  assert.equal(computeRake(0, base, true), 0);
  assert.equal(computeRake(-5, base, true), 0);
  assert.equal(computeRake(10, { ...base, rakeBps: 10000 }, true), 10); // never more than the pot
  assert.equal(computeRake(10000, { ...base, rakeBps: 0 }, true), 0);
});
