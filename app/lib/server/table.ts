// Transaction core for a poker table (SPEC §3). Server only.
// - loadTable(id): table row (state + version) and its active seats.
// - mutate(tableId, fn): read → engine → apply_table_update(version lock) → settle when the hand ended → broadcast.
// - startNextHandIfPossible / settleIfEnded as described in SPEC §3 "tick" and "Fim de mão".
// Money = integer cents everywhere.
import { applyAction, applyTimeout, legalActions, publicView, startHand } from '@poker/engine';
import type { ActionKind, HandState, LegalActions, SeatIn, TableConfig } from '@poker/engine';
import { admin } from './supabase';
import { ApiError } from './http';
import { broadcast } from './realtime';

export const HOUSE_ID = '00000000-0000-0000-0000-000000000001';
/** Milliseconds the ended hand stays visible (result/showdown) before the next one may start. */
export const NEXT_HAND_DELAY_MS = 3000;
export const RPC_RETRIES = 3;

/** HandState as stored in tables.state, plus the settlement marker written by settleIfEnded. */
export type StoredState = HandState & { settled?: boolean; settledAt?: number };

export interface TableRow {
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
  no_flop_no_drop: boolean;
  action_seconds: number;
  state: StoredState | null;
  version: number;
  hand_no: number;
  button: number | null;
  deadline_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type TablePublicRow = Omit<TableRow, 'state'>;

export interface SeatRow {
  table_id: string;
  seat: number;
  user_id: string;
  stack_cents: number;
  status: 'sitting' | 'sitout' | 'left';
  pending_leave: boolean;
  joined_at: string;
  updated_at: string;
}

export interface Loaded { table: TableRow; seats: SeatRow[] }

function dbErr(e: { message: string; code?: string }, what: string): never {
  console.error(`[db] ${what}:`, e);
  throw new ApiError(500, 'DB_ERROR', `${what}: ${e.message}`);
}

export async function loadTable(id: string): Promise<Loaded | null> {
  const sb = admin();
  const { data: table, error } = await sb.from('tables').select('*').eq('id', id).maybeSingle();
  if (error) dbErr(error, 'load table');
  if (!table) return null;
  const { data: seats, error: e2 } = await sb
    .from('seats').select('*').eq('table_id', id).neq('status', 'left').order('seat', { ascending: true });
  if (e2) dbErr(e2, 'load seats');
  return { table: table as TableRow, seats: (seats ?? []) as SeatRow[] };
}

export async function requireTable(id: string): Promise<Loaded> {
  const l = await loadTable(id);
  if (!l) throw new ApiError(404, 'TABLE_NOT_FOUND', 'table not found');
  return l;
}

export function publicTable(t: TableRow): TablePublicRow {
  const { state: _state, ...pub } = t;
  void _state;
  return pub;
}

export function configOf(t: TableRow): TableConfig {
  return {
    sb: t.sb_cents,
    bb: t.bb_cents,
    maxSeats: t.max_seats,
    rakeBps: t.rake_bps,
    rakeCap: t.rake_cap_cents,
    noFlopNoDrop: t.no_flop_no_drop,
    actionSeconds: t.action_seconds,
  };
}

export const isBettingStreet = (s: HandState | null): s is HandState =>
  !!s && (s.street === 'preflop' || s.street === 'flop' || s.street === 'turn' || s.street === 'river');

export function endedAtOf(s: HandState): number {
  const e = s.log.find((x) => x.kind === 'end');
  return e?.t ?? 0;
}

/**
 * Next hand when: no hand, or the current one ended, is settled and >= NEXT_HAND_DELAY_MS have passed;
 * and >= 2 seats 'sitting' with chips. Returns the new HandState, or null when nothing should start.
 */
export function startNextHandIfPossible(table: TableRow, seats: SeatRow[], now: number): HandState | null {
  const st = table.state;
  if (st) {
    if (st.street !== 'ended') return null;
    if (!st.settled) return null;
    const since = st.settledAt ?? endedAtOf(st);
    if (now - since < NEXT_HAND_DELAY_MS) return null;
  }
  const ins: SeatIn[] = seats
    .filter((s) => s.status !== 'left' && !s.pending_leave)
    .map((s) => ({ seat: s.seat, playerId: s.user_id, stack: s.stack_cents, sittingOut: s.status === 'sitout' || s.stack_cents <= 0 }));
  if (ins.filter((s) => !s.sittingOut).length < 2) return null;
  try {
    return startHand(configOf(table), ins, table.hand_no + 1, table.button, now);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('NOT_ENOUGH_PLAYERS')) return null;
    throw e;
  }
}

/** apply_table_update RPC. Returns the new version, or null on version conflict. */
async function applyUpdate(tableId: string, version: number, state: StoredState | null, handNo: number, button: number | null): Promise<number | null> {
  const { data, error } = await admin().rpc('apply_table_update', {
    p_table: tableId,
    p_version: version,
    p_state: state,
    p_deadline: state?.deadlineAt ? new Date(state.deadlineAt).toISOString() : null,
    p_hand_no: handNo,
    p_button: button,
  });
  if (error) dbErr(error, 'apply_table_update');
  return typeof data === 'number' ? data : null;
}

/** Call a service-role-only plpgsql RPC that answers jsonb `{ ok, ... }` or `{ error, message }`. */
export async function rpcJson<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin().rpc(fn, args);
  if (error) {
    if (error.message?.startsWith('INSUFFICIENT_BALANCE')) throw new ApiError(400, 'INSUFFICIENT_BALANCE', error.message);
    dbErr(error, fn);
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (typeof r.error === 'string') {
    const code = r.error;
    const status = code === 'TABLE_NOT_FOUND' ? 404 : code === 'NOT_ENDED' ? 409 : 400;
    throw new ApiError(status, code, typeof r.message === 'string' ? r.message : code);
  }
  return r as T;
}

/**
 * Settle an ended hand through the `settle_hand` RPC (migration 0002): ONE transaction under the table row lock
 * that writes hands (+ hand_secrets.seed, public seed_hash), actions, final stacks BY (seat, user) taken from the
 * state stored in the DB (never from this payload), house rake, cash-outs for busted / pending_leave seats, and
 * state.settled. Idempotent per handId. Returns the new table version (or the current one if already settled).
 */
export async function settleIfEnded(table: TableRow, state: HandState): Promise<number | null> {
  if (state.street !== 'ended' || !state.result) return null;
  const startT = state.log.find((e) => e.kind === 'start')?.t ?? Date.now();
  const endT = endedAtOf(state) || Date.now();

  // actions history (a timeout is logged by the engine as a 'timeout' event followed by the forced action)
  const playerOf = (seat: number) => state.players.find((p) => p.seat === seat);
  const actions: Record<string, unknown>[] = [];
  for (let i = 0; i < state.log.length; i++) {
    const e = state.log[i];
    if (e.kind !== 'action' || e.seat === undefined || !e.action) continue;
    const prev = state.log[i - 1];
    const timedOut = !!prev && prev.kind === 'timeout' && prev.seat === e.seat;
    const p = playerOf(e.seat);
    if (!p) continue;
    actions.push({
      seat: e.seat,
      user_id: p.playerId,
      street: e.street ?? 'preflop',
      action: timedOut ? 'timeout' : e.action,
      amount_cents: e.amount ?? 0,
      at: new Date(e.t).toISOString(),
    });
  }
  const r = await rpcJson<{ version: number; already: boolean }>('settle_hand', {
    p_table: table.id,
    p_hand_id: state.handId,
    p_meta: { started_at: new Date(startT).toISOString(), ended_at: new Date(endT).toISOString(), settled_at: Date.now(), actions },
  });
  return typeof r.version === 'number' ? r.version : null;
}

/** `settleOnly`: the stored state is an ended, unsettled hand -> no state write, just run settle_hand. */
export interface Mutation { state: StoredState | null; handNo?: number; button?: number | null; settleOnly?: boolean }
export interface MutateResult { changed: boolean; version: number; table: TableRow; seats: SeatRow[] }

/**
 * Read table + seats, let `fn` compute the next state with the engine, write it with the optimistic lock.
 * A null result from `fn` = nothing to change. On a version conflict in the RPC: retry from fresh state
 * (up to RPC_RETRIES) unless `expectVersion` was given (client-supplied version -> 409 at once).
 * When the written state is an ended, unsettled hand, settle it and mark `settled` in a second update.
 */
export async function mutate(
  tableId: string,
  fn: (table: TableRow, seats: SeatRow[], now: number) => Mutation | null,
  opts: { expectVersion?: number } = {},
): Promise<MutateResult> {
  for (let attempt = 1; ; attempt++) {
    const loaded = await requireTable(tableId);
    const { table, seats } = loaded;
    if (opts.expectVersion !== undefined && opts.expectVersion !== table.version) {
      throw new ApiError(409, 'VERSION_CONFLICT', `expected version ${opts.expectVersion}, table is at ${table.version}`);
    }
    const now = Date.now();
    const m = fn(table, seats, now);
    if (!m) return { changed: false, version: table.version, table, seats };
    const handNo = m.handNo ?? table.hand_no;
    const button = m.button === undefined ? table.button : m.button;

    let version: number = table.version;
    if (!m.settleOnly) {
      const v1 = await applyUpdate(table.id, table.version, m.state, handNo, button);
      if (v1 === null) {
        if (opts.expectVersion !== undefined || attempt >= RPC_RETRIES) {
          throw new ApiError(409, 'VERSION_CONFLICT', 'table changed concurrently, retry');
        }
        continue;
      }
      version = v1;
    }

    // ended + unsettled: settle atomically (a crash here leaves ended && !settled; the next tick retries)
    if (m.state && m.state.street === 'ended' && !m.state.settled) {
      const v2 = await settleIfEnded({ ...table, hand_no: handNo, button }, m.state);
      if (v2 !== null) version = v2;
    }

    void broadcast(tableId, version);
    const fresh = await requireTable(tableId);
    return { changed: true, version, table: fresh.table, seats: fresh.seats };
  }
}

/** The "tick" mutation: expired deadline -> timeout; ended+unsettled -> settle; else try to start the next hand. */
export function tickMutation(table: TableRow, seats: SeatRow[], now: number): Mutation | null {
  const st = table.state;
  if (isBettingStreet(st) && st.deadlineAt !== null && st.deadlineAt <= now) {
    const next = applyTimeout(st, now);
    if (next !== st) return { state: next };
  }
  if (st && st.street === 'ended' && !st.settled) return { state: st, settleOnly: true }; // crash recovery
  const started = startNextHandIfPossible(table, seats, now);
  if (started) return { state: started, handNo: started.handNo, button: started.button };
  if (st && st.street === 'ended' && st.settled && now - (st.settledAt ?? endedAtOf(st)) >= NEXT_HAND_DELAY_MS) {
    return { state: null }; // not enough players: clear the table (hand_no/button kept)
  }
  return null;
}

/**
 * The "action" mutation for the CALLER (`userId`): the acting seat is the one the engine state assigns to that
 * player in the current hand (never a seat number from the seats table or the client).
 * Throws 403 NOT_IN_HAND / NOT_YOUR_TURN, 400 ILLEGAL_ACTION.
 */
export function actionMutation(table: TableRow, userId: string, action: ActionKind, amount: number | undefined, now: number): Mutation {
  const st = table.state;
  if (!isBettingStreet(st)) throw new ApiError(400, 'ILLEGAL_ACTION', 'no hand in progress');
  const me = st.players.find((p) => p.playerId === userId);
  if (!me) throw new ApiError(403, 'NOT_IN_HAND', 'you are not playing this hand');
  const seat = me.seat;
  if (st.toAct !== seat) throw new ApiError(403, 'NOT_YOUR_TURN', `seat ${st.toAct} is to act`);
  try {
    return { state: applyAction(st, seat, action, amount, now) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('ILLEGAL_ACTION')) throw new ApiError(400, 'ILLEGAL_ACTION', msg);
    throw e;
  }
}

/** Legal actions for the viewer: only for the seat the engine state assigns to `userId` in this hand. */
export function legalFor(state: HandState | null, userId: string | null): LegalActions | null {
  if (!isBettingStreet(state) || !userId) return null;
  const me = state.players.find((p) => p.playerId === userId);
  return me ? legalActions(state, me.seat) : null;
}

export { publicView };
