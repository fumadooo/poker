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

/**
 * Persist an ended hand exactly once: hands (claim by PK = handId; ended_at set last = "complete"),
 * actions, seats.stack_cents from result.stacks, ledger rake for the house, cashout + 'left' for busted
 * or pending_leave players. Returns true when the hand is (now or already) fully settled.
 */
export async function settleIfEnded(table: TableRow, state: HandState): Promise<boolean> {
  if (state.street !== 'ended' || !state.result) return false;
  const sb = admin();
  const startT = state.log.find((e) => e.kind === 'start')?.t ?? Date.now();
  const endT = endedAtOf(state) || Date.now();
  const potCents = state.pots.reduce((a, p) => a + p.amount, 0);

  // 1. claim
  const { error: claimErr } = await sb.from('hands').insert({
    id: state.handId,
    table_id: table.id,
    hand_no: state.handNo,
    started_at: new Date(startT).toISOString(),
    ended_at: null,
    board: state.board,
    pot_cents: potCents,
    rake_cents: state.rake,
    seed: state.seed,
    result: state.result,
    log: state.log,
  });
  if (claimErr) {
    if (claimErr.code === '23505') {
      const { data } = await sb.from('hands').select('ended_at').eq('id', state.handId).maybeSingle();
      return !!data?.ended_at; // someone else settled (or is settling) this hand
    }
    dbErr(claimErr, 'insert hand');
  }

  // 2. actions (a timeout is logged by the engine as a 'timeout' event followed by the forced action)
  const playerOf = (seat: number) => state.players.find((p) => p.seat === seat);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < state.log.length; i++) {
    const e = state.log[i];
    if (e.kind !== 'action' || e.seat === undefined || !e.action) continue;
    const prev = state.log[i - 1];
    const timedOut = !!prev && prev.kind === 'timeout' && prev.seat === e.seat;
    const p = playerOf(e.seat);
    if (!p) continue;
    rows.push({
      hand_id: state.handId,
      seat: e.seat,
      user_id: p.playerId,
      street: e.street ?? 'preflop',
      action: timedOut ? 'timeout' : e.action,
      amount_cents: e.amount ?? 0,
      at: new Date(e.t).toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await sb.from('actions').insert(rows);
    if (error) dbErr(error, 'insert actions');
  }

  // 3. stacks back to seats (players who left mid-hand were cashed out at fold time: skip)
  const nowIso = new Date().toISOString();
  for (const r of state.result.stacks) {
    const { error } = await sb.from('seats')
      .update({ stack_cents: r.stack, updated_at: nowIso })
      .eq('table_id', table.id).eq('seat', r.seat).neq('status', 'left');
    if (error) dbErr(error, 'update seat stack');
  }

  // 4. rake -> house
  if (state.rake > 0) {
    const { error } = await sb.from('ledger').insert({
      user_id: HOUSE_ID, kind: 'rake', amount_cents: state.rake, table_id: table.id, hand_id: state.handId,
      meta: { hand_no: state.handNo, pot_cents: potCents },
    });
    if (error) dbErr(error, 'insert rake');
  }

  // 5. busted or leaving players -> cashout (+stack) and 'left'
  const { data: seats, error: sErr } = await sb.from('seats').select('*').eq('table_id', table.id).neq('status', 'left');
  if (sErr) dbErr(sErr, 'reload seats');
  for (const s of (seats ?? []) as SeatRow[]) {
    if (s.stack_cents > 0 && !s.pending_leave) continue;
    const { error: lErr } = await sb.from('ledger').insert({
      user_id: s.user_id, kind: 'cashout', amount_cents: s.stack_cents, table_id: table.id, hand_id: state.handId,
      meta: { seat: s.seat, reason: s.stack_cents === 0 ? 'busted' : 'leave' },
    });
    if (lErr) dbErr(lErr, 'insert cashout');
    const { error: uErr } = await sb.from('seats')
      .update({ status: 'left', stack_cents: 0, pending_leave: false, updated_at: nowIso })
      .eq('table_id', table.id).eq('seat', s.seat);
    if (uErr) dbErr(uErr, 'leave seat');
  }

  // 6. complete (hands/actions become publicly readable only now: RLS requires ended_at)
  const { error: fin } = await sb.from('hands').update({ ended_at: new Date(endT).toISOString() }).eq('id', state.handId);
  if (fin) dbErr(fin, 'finish hand');
  return true;
}

export interface Mutation { state: StoredState | null; handNo?: number; button?: number | null }
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

    let version = await applyUpdate(table.id, table.version, m.state, handNo, button);
    if (version === null) {
      if (opts.expectVersion !== undefined || attempt >= RPC_RETRIES) {
        throw new ApiError(409, 'VERSION_CONFLICT', 'table changed concurrently, retry');
      }
      continue;
    }

    if (m.state && m.state.street === 'ended' && !m.state.settled) {
      const done = await settleIfEnded({ ...table, hand_no: handNo, button }, m.state);
      if (done) {
        const v2 = await applyUpdate(table.id, version, { ...m.state, settled: true, settledAt: Date.now() }, handNo, button);
        if (v2 !== null) version = v2;
      }
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
  if (st && st.street === 'ended' && !st.settled) return { state: st }; // re-write -> mutate settles it
  const started = startNextHandIfPossible(table, seats, now);
  if (started) return { state: started, handNo: started.handNo, button: started.button };
  if (st && st.street === 'ended' && st.settled && now - (st.settledAt ?? endedAtOf(st)) >= NEXT_HAND_DELAY_MS) {
    return { state: null }; // not enough players: clear the table (hand_no/button kept)
  }
  return null;
}

/** The "action" mutation for `seat`. Throws 403 NOT_YOUR_TURN / 400 ILLEGAL_ACTION. */
export function actionMutation(table: TableRow, seat: number, action: ActionKind, amount: number | undefined, now: number): Mutation {
  const st = table.state;
  if (!isBettingStreet(st)) throw new ApiError(400, 'ILLEGAL_ACTION', 'no hand in progress');
  if (st.toAct !== seat) throw new ApiError(403, 'NOT_YOUR_TURN', `seat ${st.toAct} is to act`);
  try {
    return { state: applyAction(st, seat, action, amount, now) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('ILLEGAL_ACTION')) throw new ApiError(400, 'ILLEGAL_ACTION', msg);
    throw e;
  }
}

export function legalFor(state: HandState | null, seat: number | null): LegalActions | null {
  if (!isBettingStreet(state) || seat === null) return null;
  return legalActions(state, seat);
}

export { publicView };
