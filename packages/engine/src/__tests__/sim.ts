// Shared random-play simulation used by the test suite and the standalone stats script.
import {
  applyAction, applyTimeout, legalActions, startHand, prngFromSeed, categoryOfRank, categoryName, evaluate7,
  type ActionKind, type HandState, type SeatIn, type TableConfig,
} from '../index.js';

export interface SimStats {
  hands: number;
  actions: number;
  timeouts: number;
  showdowns: number;
  uncontested: number;
  totalRake: number;
  totalPot: number;
  maxPlayers: number;
  playersHist: Record<number, number>;
  handNames: Record<string, number>;
  streetEnded: Record<string, number>;
  splitPots: number;
  sidePotHands: number;
  ms: number;
}

export function runSimulation(hands: number, seedHex: string, onHand?: (s: HandState, initial: number) => void): SimStats {
  const rng = prngFromSeed(seedHex);
  const ri = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const stats: SimStats = {
    hands: 0, actions: 0, timeouts: 0, showdowns: 0, uncontested: 0, totalRake: 0, totalPot: 0, maxPlayers: 0,
    playersHist: {}, handNames: {}, streetEnded: {}, splitPots: 0, sidePotHands: 0, ms: 0,
  };
  const t0 = Date.now();
  let prevButton: number | null = null;
  for (let h = 0; h < hands; h++) {
    const n = ri(2, 9);
    const bb = [2, 10, 50, 100, 500][ri(0, 4)];
    const config: TableConfig = {
      sb: Math.max(1, Math.floor(bb / 2)), bb, maxSeats: 9, rakeBps: 500,
      rakeCap: rng() < 0.3 ? bb * 4 : null, noFlopNoDrop: rng() < 0.7, actionSeconds: 20,
    };
    const seats: SeatIn[] = [];
    const chosen = new Set<number>();
    while (chosen.size < n) chosen.add(ri(0, 8));
    for (const seat of chosen) {
      const r = rng();
      const stack = r < 0.15 ? ri(1, bb) : r < 0.5 ? ri(bb, bb * 20) : ri(bb * 20, bb * 200);
      seats.push({ seat, playerId: 'p' + seat, stack, sittingOut: rng() < 0.05 });
    }
    // guarantee at least 2 active
    const act = seats.filter((s) => !s.sittingOut && s.stack > 0);
    if (act.length < 2) { seats[0].sittingOut = false; seats[0].stack = Math.max(seats[0].stack, bb); seats[1].sittingOut = false; seats[1].stack = Math.max(seats[1].stack, bb); }
    const initial = seats.reduce((a, s) => a + s.stack, 0);
    let now = 1_700_000_000_000 + h * 60_000;
    let s = startHand(config, seats, h + 1, prevButton, now, rng);
    prevButton = s.button;
    const activeN = s.players.filter((p) => !p.sittingOut).length;
    stats.playersHist[activeN] = (stats.playersHist[activeN] ?? 0) + 1;
    stats.maxPlayers = Math.max(stats.maxPlayers, activeN);
    let guard = 0;
    while (s.street !== 'ended') {
      if (++guard > 500) throw new Error('hand did not end after 500 steps (handNo ' + s.handNo + ')');
      if (s.toAct === null) throw new Error('toAct null while not ended');
      const seat = s.toAct;
      now += ri(100, 3000);
      if (rng() < 0.04) {
        // timeout path
        const late = s.deadlineAt! + 1;
        const before = JSON.stringify(s);
        const t = applyTimeout(s, late);
        if (t === s) throw new Error('timeout not applied');
        if (JSON.stringify(s) !== before) throw new Error('applyTimeout mutated input');
        s = t; now = late;
        stats.timeouts++;
        continue;
      }
      // not-yet-expired timeout must be a no-op
      if (applyTimeout(s, s.deadlineAt! - 1) !== s) throw new Error('premature timeout');
      const la = legalActions(s, seat);
      if (!la) throw new Error('no legal actions for toAct');
      const opts: { k: ActionKind; w: number; amt?: number }[] = [];
      if (la.check) opts.push({ k: 'check', w: 5 });
      if (la.call !== null) opts.push({ k: 'call', w: 5 });
      opts.push({ k: 'fold', w: la.check ? 0.5 : 2.5 });
      if (la.bet) opts.push({ k: 'bet', w: 3, amt: rng() < 0.2 ? la.bet.max : ri(la.bet.min, la.bet.max) });
      if (la.raise) opts.push({ k: 'raise', w: 2.5, amt: rng() < 0.2 ? la.raise.max : ri(la.raise.min, la.raise.max) });
      opts.push({ k: 'allin', w: 0.6 });
      const total = opts.reduce((a, o) => a + o.w, 0);
      let pick = rng() * total;
      let chosenOpt = opts[opts.length - 1];
      for (const o of opts) { if (pick < o.w) { chosenOpt = o; break; } pick -= o.w; }
      const before = JSON.stringify(s);
      const next = applyAction(s, seat, chosenOpt.k, chosenOpt.amt, now);
      if (JSON.stringify(s) !== before) throw new Error('applyAction mutated input');
      s = next;
      stats.actions++;
    }
    // invariants
    const finalSum = s.players.reduce((a, p) => a + p.stack, 0);
    if (finalSum + s.rake !== initial) throw new Error(`chips leak: initial ${initial} final ${finalSum} rake ${s.rake} hand ${s.handNo}`);
    if (!s.result) throw new Error('no result');
    if (s.result.rake !== s.rake) throw new Error('result.rake mismatch');
    const paid = s.result.winners.reduce((a, w) => a + w.amount, 0);
    const potSum = s.pots.reduce((a, p) => a + p.amount, 0);
    if (paid + s.rake !== potSum) throw new Error(`payout ${paid} + rake ${s.rake} != pots ${potSum}`);
    for (const p of s.players) if (p.stack < 0) throw new Error('negative stack');
    if (s.toAct !== null || s.deadlineAt !== null) throw new Error('ended with toAct/deadline');
    for (const w of s.result.winners) {
      const p = s.players.find((x) => x.seat === w.seat)!;
      if (p.folded) throw new Error('folded player won');
      if (!s.pots[w.potIndex].eligible.includes(w.seat)) throw new Error('winner not eligible for pot');
    }
    if (s.result.shown.length > 0) {
      stats.showdowns++;
      if (s.board.length !== 5) throw new Error('showdown without full board');
      for (const sh of s.result.shown) {
        const name = sh.hand;
        stats.handNames[name.split(',')[0].replace(/^Pair of .*/, 'Pair')] = (stats.handNames[name.split(',')[0].replace(/^Pair of .*/, 'Pair')] ?? 0) + 1;
        // winner of each pot must have the top rank among eligible
      }
      for (let i = 0; i < s.pots.length; i++) {
        const pot = s.pots[i];
        const ranks = pot.eligible.map((seat) => evaluate7(s.players.find((p) => p.seat === seat)!.hole.concat(s.board)).rank);
        const best = Math.max(...ranks);
        const winners = s.result.winners.filter((w) => w.potIndex === i);
        for (const w of winners) {
          const r = evaluate7(s.players.find((p) => p.seat === w.seat)!.hole.concat(s.board)).rank;
          if (r !== best) throw new Error('pot paid to a non-best hand');
        }
        if (winners.length > 1) stats.splitPots++;
      }
    } else {
      stats.uncontested++;
      if (s.result.winners.some((w) => w.hand)) throw new Error('uncontested winner has hand name');
    }
    if (s.pots.length > 1) stats.sidePotHands++;
    stats.totalRake += s.rake;
    stats.totalPot += potSum;
    stats.streetEnded[s.board.length] = (stats.streetEnded[s.board.length] ?? 0) + 1;
    stats.hands++;
    onHand?.(s, initial);
  }
  stats.ms = Date.now() - t0;
  return stats;
}

export function formatStats(st: SimStats): string {
  const lines = [
    `hands=${st.hands} actions=${st.actions} timeouts=${st.timeouts} ms=${st.ms} hands/sec=${Math.round((st.hands / Math.max(1, st.ms)) * 1000)}`,
    `showdowns=${st.showdowns} uncontested=${st.uncontested} splitPots=${st.splitPots} handsWithSidePots=${st.sidePotHands}`,
    `totalPot=${st.totalPot} totalRake=${st.totalRake} (${((st.totalRake / st.totalPot) * 100).toFixed(2)}% of pot incl. no-flop-no-drop hands)`,
    `players: ${Object.entries(st.playersHist).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `board cards at end: ${Object.entries(st.streetEnded).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `hand names at showdown: ${Object.entries(st.handNames).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  ];
  return lines.join('\n');
}

export { categoryOfRank, categoryName };
