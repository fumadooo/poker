// MOCK (NEXT_PUBLIC_MOCK=1): dados falsos em memória para renderizar a UI antes da API existir.
// Não contém regras de poker "de verdade": só o suficiente para a tela reagir a cliques.

import type {
  ActionBody, ActionKind, CreateTableBody, HandEvent, HandState, LegalActions, MeInfo, PlayerState,
  SeatRow, TablePublic, TableStateResponse,
} from './types';
import { ApiRequestError } from './types';

export const MOCK_USER_ID = 'mock-user-0001';

const now0 = Date.now();

const tables: TablePublic[] = [
  { id: 'mesa-ipanema', name: 'Ipanema', game: 'nlh', sb_cents: 50, bb_cents: 100, max_seats: 9, min_buyin_cents: 4000, max_buyin_cents: 20000, rake_bps: 500, rake_cap_cents: null, hand_no: 128, seated: 6 },
  { id: 'mesa-copacabana', name: 'Copacabana', game: 'nlh', sb_cents: 100, bb_cents: 200, max_seats: 6, min_buyin_cents: 10000, max_buyin_cents: 40000, rake_bps: 500, rake_cap_cents: null, hand_no: 41, seated: 3 },
  { id: 'mesa-leblon', name: 'Leblon High', game: 'nlh', sb_cents: 500, bb_cents: 1000, max_seats: 9, min_buyin_cents: 50000, max_buyin_cents: 200000, rake_bps: 500, rake_cap_cents: 5000, hand_no: 7, seated: 0 },
];

let balance = 100_000 - 20_000; // já comprou fichas na Ipanema
let creditsToday = 1;

const seatsByTable: Record<string, SeatRow[]> = {
  'mesa-ipanema': [
    { seat: 0, user_id: 'u-rafa', nick: 'Rafa_BR', stack_cents: 18450, status: 'sitting' },
    { seat: 1, user_id: 'u-tub', nick: 'Tubarão', stack_cents: 9900, status: 'sitting' },
    { seat: 3, user_id: MOCK_USER_ID, nick: 'Você', stack_cents: 19600, status: 'sitting' },
    { seat: 4, user_id: 'u-lu', nick: 'Dona Lu', stack_cents: 4300, status: 'sitting' },
    { seat: 6, user_id: 'u-jhow', nick: 'Jhow', stack_cents: 32100, status: 'sitting' },
    { seat: 7, user_id: 'u-cari', nick: 'Carioca77', stack_cents: 12000, status: 'sitting' },
  ],
  'mesa-copacabana': [
    { seat: 0, user_id: 'u-ped', nick: 'Pedrinho', stack_cents: 20000, status: 'sitting' },
    { seat: 2, user_id: 'u-min', nick: 'Mineiro', stack_cents: 31000, status: 'sitting' },
    { seat: 4, user_id: 'u-ze', nick: 'Zé', stack_cents: 12000, status: 'sitting' },
  ],
  'mesa-leblon': [],
};

function player(seat: number, playerId: string, stack: number, committed: number, total: number, extra: Partial<PlayerState> = {}): PlayerState {
  return { seat, playerId, stack, committed, totalCommitted: total, folded: false, allIn: false, hole: [], sittingOut: false, acted: false, ...extra };
}

function makeFlopState(): HandState {
  const t0 = now0 - 25_000;
  const log: HandEvent[] = [
    { t: t0, kind: 'start', data: { handNo: 128 } },
    { t: t0 + 100, kind: 'blind', seat: 7, amount: 50 },
    { t: t0 + 120, kind: 'blind', seat: 0, amount: 100 },
    { t: t0 + 300, kind: 'deal' },
    { t: t0 + 2000, kind: 'action', seat: 1, action: 'call', amount: 100 },
    { t: t0 + 5000, kind: 'action', seat: 3, action: 'raise', amount: 400 },
    { t: t0 + 8000, kind: 'action', seat: 4, action: 'fold' },
    { t: t0 + 11000, kind: 'action', seat: 6, action: 'call', amount: 400 },
    { t: t0 + 14000, kind: 'action', seat: 7, action: 'fold' },
    { t: t0 + 17000, kind: 'action', seat: 0, action: 'call', amount: 300 },
    { t: t0 + 19000, kind: 'action', seat: 1, action: 'call', amount: 300 },
    { t: t0 + 20000, kind: 'street', street: 'flop', cards: ['Ah', '7d', '2c'] },
    { t: t0 + 22000, kind: 'action', seat: 0, action: 'check' },
    { t: t0 + 24000, kind: 'action', seat: 1, action: 'bet', amount: 600 },
  ];
  return {
    handId: 'hand-mock-128',
    handNo: 128,
    config: { sb: 50, bb: 100, maxSeats: 9, rakeBps: 500, rakeCap: null, noFlopNoDrop: true, actionSeconds: 20 },
    street: 'flop',
    board: ['Ah', '7d', '2c'],
    players: [
      player(0, 'u-rafa', 18050, 0, 400),
      player(1, 'u-tub', 9300, 600, 1000),
      player(3, MOCK_USER_ID, 19200, 0, 400, { hole: ['As', 'Kd'] }),
      player(4, 'u-lu', 4300, 0, 0, { folded: true }),
      player(6, 'u-jhow', 31700, 0, 400),
      player(7, 'u-cari', 11950, 0, 50, { folded: true }),
    ],
    button: 6,
    sbSeat: 7,
    bbSeat: 0,
    toAct: 3,
    currentBet: 600,
    minRaise: 600,
    lastAggressor: 1,
    pots: [{ amount: 2250, eligible: [0, 1, 3, 6] }], // = Σ totalCommitted, como o motor
    rake: 0,
    deadlineAt: Date.now() + 20_000,
    log,
    result: null,
  };
}

const states: Record<string, { state: HandState | null; version: number }> = {
  'mesa-ipanema': { state: makeFlopState(), version: 17 },
  'mesa-copacabana': { state: null, version: 3 },
  'mesa-leblon': { state: null, version: 0 },
};

function legalFor(state: HandState | null, seat: number | null): LegalActions | null {
  if (!state || seat == null || state.toAct !== seat) return null;
  const p = state.players.find((x) => x.seat === seat);
  if (!p || p.folded) return null;
  const toCall = Math.max(0, state.currentBet - p.committed);
  const max = p.stack + p.committed;
  const canCheck = toCall === 0;
  return {
    seat,
    fold: true, // motor: fold é sempre legal
    check: canCheck,
    call: toCall > 0 ? Math.min(toCall, p.stack) : null,
    bet: state.currentBet === 0 ? { min: Math.min(state.config.bb, p.stack), max: p.stack } : null, // bet = fichas na rua
    raise: state.currentBet > 0 && !p.acted && max >= state.currentBet + state.minRaise ? { min: state.currentBet + state.minRaise, max } : null, // raise-TO
    allin: p.stack, // motor: allin = stack restante
  };
}

function delay<T>(v: T, ms = 120): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

function bump(id: string) {
  states[id].version += 1;
}

function nextToAct(state: HandState, from: number): number | null {
  const live = state.players.filter((p) => !p.folded && !p.allIn).map((p) => p.seat).sort((a, b) => a - b);
  if (live.length <= 1) return null;
  const after = live.find((s) => s > from);
  return after ?? live[0];
}

function finishHand(id: string, state: HandState) {
  const live = state.players.filter((p) => !p.folded);
  const potTotal = state.players.reduce((a, p) => a + p.totalCommitted, 0);
  const rake = Math.floor((potTotal * state.config.rakeBps) / 10000);
  const winner = live[0] ?? state.players[0];
  const amount = potTotal - rake;
  const t = Date.now();
  const shown = live.length > 1
    ? live.map((p) => ({ seat: p.seat, hole: p.seat === 3 ? ['As', 'Kd'] : ['Qc', 'Qh'], hand: p.seat === 3 ? 'Par de Ases' : 'Par de Damas' }))
    : [];
  const result = {
    winners: [{ seat: winner.seat, playerId: winner.playerId, amount, potIndex: 0, hand: shown.find((s) => s.seat === winner.seat)?.hand }],
    rake,
    shown,
    stacks: state.players.map((p) => ({ seat: p.seat, stack: p.stack + (p.seat === winner.seat ? amount : 0) })),
  };
  const extra: HandEvent[] = [];
  for (const s of shown) extra.push({ t, kind: 'showdown', seat: s.seat, cards: s.hole, data: { hand: s.hand } });
  extra.push({ t, kind: 'rake', amount: rake }, { t, kind: 'payout', seat: winner.seat, amount }, { t, kind: 'end' });
  states[id].state = {
    ...state,
    street: 'ended',
    toAct: null,
    deadlineAt: null,
    players: state.players.map((p) => ({ ...p, committed: 0, stack: p.stack + (p.seat === winner.seat ? amount : 0) })),
    pots: [{ amount: potTotal, eligible: live.map((p) => p.seat) }],
    rake,
    result,
    log: [...state.log, ...extra],
  };
}

function applyMockAction(id: string, seat: number, action: ActionKind, amount?: number) {
  const st = states[id].state;
  if (!st) throw new ApiRequestError(400, 'NO_HAND', 'Sem mão em curso');
  if (st.toAct !== seat) throw new ApiRequestError(403, 'NOT_YOUR_TURN', 'Não é a sua vez');
  const legal = legalFor(st, seat)!;
  const players = st.players.map((p) => ({ ...p }));
  const p = players.find((x) => x.seat === seat)!;
  let currentBet = st.currentBet;
  let minRaise = st.minRaise;
  const put = (n: number) => {
    n = Math.min(n, p.stack);
    p.stack -= n;
    p.committed += n;
    p.totalCommitted += n;
    if (p.stack === 0) p.allIn = true;
  };
  switch (action) {
    case 'fold':
      if (!legal.fold) throw new ApiRequestError(400, 'ILLEGAL_ACTION', 'Fold ilegal');
      p.folded = true;
      break;
    case 'check':
      if (!legal.check) throw new ApiRequestError(400, 'ILLEGAL_ACTION', 'Check ilegal');
      break;
    case 'call':
      if (legal.call == null) throw new ApiRequestError(400, 'ILLEGAL_ACTION', 'Call ilegal');
      put(legal.call);
      break;
    case 'bet':
      if (!legal.bet || amount == null || amount < legal.bet.min || amount > legal.bet.max) throw new ApiRequestError(400, 'ILLEGAL_ACTION', 'Bet fora do intervalo');
      put(amount);
      currentBet = p.committed;
      minRaise = amount;
      break;
    case 'raise':
      if (!legal.raise || amount == null || amount < legal.raise.min || amount > legal.raise.max) throw new ApiRequestError(400, 'ILLEGAL_ACTION', 'Raise fora do intervalo');
      put(amount - p.committed);
      minRaise = amount - currentBet;
      currentBet = p.committed;
      break;
    case 'allin':
      put(p.stack);
      if (p.committed > currentBet) {
        minRaise = Math.max(minRaise, p.committed - currentBet);
        currentBet = p.committed;
      }
      break;
  }
  p.acted = true;
  const t = Date.now();
  const log: HandEvent[] = [...st.log, { t, kind: 'action', seat, action, amount: action === 'fold' || action === 'check' ? undefined : p.committed }];
  const next = nextToAct({ ...st, players }, seat);
  const newState: HandState = {
    ...st,
    players,
    pots: [{ amount: players.reduce((a, x) => a + x.totalCommitted, 0), eligible: players.filter((x) => !x.folded).map((x) => x.seat) }],
    currentBet,
    minRaise,
    lastAggressor: action === 'bet' || action === 'raise' ? seat : st.lastAggressor,
    toAct: next,
    deadlineAt: next == null ? null : t + st.config.actionSeconds * 1000,
    log,
  };
  states[id].state = newState;
  bump(id);
  const live = players.filter((x) => !x.folded);
  // Mock simplificado: a mão termina quando sobra um, ou quando a ação volta a quem agiu (não simula ruas seguintes).
  if (live.length === 1 || next == null || next === st.toAct) finishHand(id, newState);
}

export const mockApi = {
  async getMe(): Promise<MeInfo> {
    return delay({ id: MOCK_USER_ID, email: 'voce@exemplo.com.br', nick: 'Você', balance });
  },
  async credit(): Promise<{ balance: number }> {
    if (creditsToday >= 5) throw new ApiRequestError(400, 'CREDIT_LIMIT', 'Limite de 5 créditos por dia');
    creditsToday += 1;
    balance += 100_000;
    return delay({ balance });
  },
  async listTables(): Promise<TablePublic[]> {
    return delay(tables.map((t) => ({ ...t, seated: seatsByTable[t.id].filter((s) => s.status !== 'left').length })));
  },
  async createTable(body: CreateTableBody): Promise<{ id: string }> {
    const id = 'mesa-' + Math.random().toString(36).slice(2, 8);
    tables.push({ id, name: body.name, game: 'nlh', sb_cents: body.sb, bb_cents: body.bb, max_seats: body.maxSeats, min_buyin_cents: body.minBuyin, max_buyin_cents: body.maxBuyin, rake_bps: body.rakeBps, rake_cap_cents: body.rakeCap, hand_no: 0, seated: 0 });
    seatsByTable[id] = [];
    states[id] = { state: null, version: 0 };
    return delay({ id });
  },
  async getState(id: string): Promise<TableStateResponse> {
    const table = tables.find((t) => t.id === id);
    if (!table) throw new ApiRequestError(404, 'NOT_FOUND', 'Mesa não encontrada');
    const seats = seatsByTable[id].filter((s) => s.status !== 'left');
    const mine = seats.find((s) => s.user_id === MOCK_USER_ID);
    const raw = states[id].state;
    const shownOf = (seat: number) => raw?.result?.shown.find((s) => s.seat === seat)?.hole;
    const state: HandState | null = raw
      ? {
          ...raw,
          deck: undefined,
          seed: undefined,
          players: raw.players.map((p) => ({
            ...p,
            hole: p.playerId === MOCK_USER_ID ? p.hole : raw.street === 'ended' ? shownOf(p.seat) ?? [] : [],
          })),
        }
      : null;
    const myP = raw?.players.find((p) => p.playerId === MOCK_USER_ID);
    return delay({
      ok: true,
      table: { ...table, seated: seats.length },
      seats,
      state,
      me: mine ? { seat: mine.seat, hole: myP?.hole ?? [] } : null,
      legal: legalFor(raw, mine?.seat ?? null),
      version: states[id].version,
      serverNow: Date.now(),
    }, 60);
  },
  async sit(id: string, seat: number, buyin: number): Promise<{ ok: true }> {
    const table = tables.find((t) => t.id === id)!;
    const seats = seatsByTable[id];
    if (seats.some((s) => s.seat === seat && s.status !== 'left')) throw new ApiRequestError(400, 'SEAT_TAKEN', 'Assento ocupado');
    if (buyin < table.min_buyin_cents || buyin > table.max_buyin_cents) throw new ApiRequestError(400, 'BUYIN_RANGE', 'Buy-in fora do intervalo');
    if (buyin > balance) throw new ApiRequestError(400, 'INSUFFICIENT_BALANCE', 'Saldo insuficiente');
    balance -= buyin;
    seatsByTable[id] = [...seats.filter((s) => s.user_id !== MOCK_USER_ID), { seat, user_id: MOCK_USER_ID, nick: 'Você', stack_cents: buyin, status: 'sitting' }];
    bump(id);
    return delay({ ok: true });
  },
  async leave(id: string): Promise<{ ok: true; pending: boolean }> {
    const seats = seatsByTable[id];
    const mine = seats.find((s) => s.user_id === MOCK_USER_ID);
    if (!mine) return delay({ ok: true, pending: false });
    const st = states[id].state;
    const inHand = !!st && st.street !== 'ended' && st.players.some((p) => p.playerId === MOCK_USER_ID && !p.folded);
    if (inHand) return delay({ ok: true, pending: true });
    balance += mine.stack_cents;
    seatsByTable[id] = seats.filter((s) => s.user_id !== MOCK_USER_ID);
    bump(id);
    return delay({ ok: true, pending: false });
  },
  async action(id: string, body: ActionBody): Promise<{ ok: true; version: number }> {
    if (body.version !== states[id].version) throw new ApiRequestError(409, 'VERSION_CONFLICT', 'Estado desatualizado');
    const mine = seatsByTable[id].find((s) => s.user_id === MOCK_USER_ID);
    if (!mine) throw new ApiRequestError(403, 'NOT_SEATED', 'Você não está sentado');
    applyMockAction(id, mine.seat, body.action, body.amount);
    return delay({ ok: true, version: states[id].version });
  },
  async tick(id: string): Promise<{ ok: true; changed: boolean }> {
    const st = states[id].state;
    if (!st) return { ok: true, changed: false };
    // como a API (A1): a mão encerrada fica visível ~3 s ("liquidada") e o tick seguinte limpa o state
    if (st.street === 'ended') {
      const endedAt = st.log[st.log.length - 1]?.t ?? 0;
      if (Date.now() - endedAt < 3000) return { ok: true, changed: false };
      const stacks = new Map((st.result?.stacks ?? []).map((x) => [x.seat, x.stack]));
      seatsByTable[id] = seatsByTable[id].map((r) => (stacks.has(r.seat) ? { ...r, stack_cents: stacks.get(r.seat)! } : r));
      states[id].state = null;
      bump(id);
      return delay({ ok: true, changed: true });
    }
    if (st.deadlineAt != null && st.deadlineAt <= Date.now() && st.toAct != null) {
      const legal = legalFor(st, st.toAct);
      const t = Date.now();
      states[id].state = { ...st, log: [...st.log, { t, kind: 'timeout', seat: st.toAct }] };
      applyMockAction(id, st.toAct, legal?.check ? 'check' : 'fold');
      return delay({ ok: true, changed: true });
    }
    return { ok: true, changed: false };
  },
};
