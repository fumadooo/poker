import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation, formatStats } from './sim.js';

test('10,000 random hands (2-9 players): chips conserved, no exceptions, all ended', () => {
  const st = runSimulation(10000, 'a11ce000a11ce000a11ce000a11ce000a11ce000a11ce000a11ce000a11ce000');
  assert.equal(st.hands, 10000);
  assert.ok(st.showdowns > 1000, 'should see plenty of showdowns');
  assert.ok(st.uncontested > 1000, 'should see plenty of uncontested pots');
  assert.ok(st.sidePotHands > 100, 'should exercise side pots');
  assert.ok(st.timeouts > 100, 'should exercise timeouts');
  assert.ok(st.maxPlayers === 9);
  console.log(formatStats(st));
});

test('simulation is deterministic for a given seed', () => {
  const a = runSimulation(300, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  const b = runSimulation(300, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  assert.deepEqual({ ...a, ms: 0 }, { ...b, ms: 0 });
});
