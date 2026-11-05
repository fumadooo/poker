// Tipos espelhados de docs/SPEC-contracts-v1.md (§1 motor, §3 API). Dinheiro em centavos inteiros.

export type Card = string; // "As", "Td", "2c"
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface TableConfig {
  sb: number;
  bb: number;
  maxSeats: number;
  rakeBps: number;
  rakeCap: number | null;
  noFlopNoDrop: boolean;
  actionSeconds: number;
}

export interface PlayerState {
  seat: number;
  playerId: string;
  stack: number;
  committed: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  hole: Card[]; // vazio para quem não é o viewer (publicView)
  sittingOut: boolean;
  acted: boolean;
}

export interface Pot {
  amount: number;
  eligible: number[];
}

export interface HandEvent {
  t: number;
  kind: 'start' | 'blind' | 'deal' | 'action' | 'street' | 'showdown' | 'payout' | 'rake' | 'end' | 'timeout';
  seat?: number;
  action?: ActionKind;
  amount?: number;
  street?: Street;
  cards?: Card[];
  data?: unknown;
}

export interface HandResult {
  winners: { seat: number; playerId: string; amount: number; potIndex: number; hand?: string }[];
  rake: number;
  shown: { seat: number; hole: Card[]; hand: string }[];
  stacks: { seat: number; stack: number }[];
}

export interface HandState {
  handId: string;
  handNo: number;
  config: TableConfig;
  street: Street;
  deck?: Card[]; // nunca vem do servidor (publicView remove)
  board: Card[];
  players: PlayerState[];
  button: number;
  sbSeat: number;
  bbSeat: number;
  toAct: number | null;
  currentBet: number;
  minRaise: number;
  lastAggressor: number | null;
  pots: Pot[];
  rake: number;
  deadlineAt: number | null; // epoch ms
  log: HandEvent[];
  result: HandResult | null;
  seed?: string;
  legal?: LegalActions | null; // a API pode embutir aqui ou no topo da resposta
}

export interface LegalActions {
  seat: number;
  fold: boolean;
  check: boolean;
  call: number | null;
  bet: { min: number; max: number } | null;
  raise: { min: number; max: number } | null;
  allin: number;
}

// ---- API (§3) ----

export interface ApiError {
  ok: false;
  error: string;
  message?: string;
}

export interface TablePublic {
  id: string;
  name: string;
  game: 'nlh';
  sb_cents: number;
  bb_cents: number;
  max_seats: number;
  min_buyin_cents: number;
  max_buyin_cents: number;
  rake_bps: number;
  rake_cap_cents: number | null;
  hand_no?: number;
  seated?: number; // sentados (GET /api/tables)
  created_at?: string;
}

export interface SeatRow {
  seat: number;
  user_id: string;
  nick?: string | null;
  stack_cents: number;
  status: 'sitting' | 'sitout' | 'left';
  pending_leave?: boolean;
}

export interface MeInfo {
  id: string;
  email?: string | null;
  nick?: string | null;
  balance: number; // centavos
}

export interface TableStateResponse {
  ok: true;
  table: TablePublic;
  seats: SeatRow[];
  state: HandState | null;
  me: { seat: number | null; hole: Card[] } | null;
  legal?: LegalActions | null;
  version: number;
  serverNow?: number; // epoch ms do servidor (corrige relógio do cliente)
}

export interface CreateTableBody {
  name: string;
  sb: number;
  bb: number;
  maxSeats: number;
  rakeBps: number;
  rakeCap: number | null;
  minBuyin: number;
  maxBuyin: number;
}

export interface ActionBody {
  action: ActionKind;
  amount?: number;
  version: number;
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}
