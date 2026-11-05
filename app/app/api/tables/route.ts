// GET  /api/tables -> { ok, tables: tables_public rows + seated count }   (public, no auth)
// POST /api/tables { name, sb, bb, maxSeats, rakeBps?, rakeCap?, minBuyin?, maxBuyin? } -> { ok, id }
//   allowlisted: sb/bb pairs, maxSeats 2|6|9, rake 500 bps no cap, buy-in within 40..200 bb; 3 tables/user/day
import { connection, type NextRequest } from 'next/server';
import { ApiError, handle, intField, ok, readJson, requireUser } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';
import { rpcJson } from '@/lib/server/table';


export async function GET() {
  await connection(); // cacheComponents: route is always dynamic (never prerendered)
  return handle(async () => {
    const sb = admin();
    const [{ data: tables, error }, { data: seats, error: e2 }] = await Promise.all([
      sb.from('tables_public').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('seats').select('table_id').neq('status', 'left'),
    ]);
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);
    if (e2) throw new ApiError(500, 'DB_ERROR', e2.message);
    const seated = new Map<string, number>();
    for (const s of seats ?? []) seated.set(s.table_id, (seated.get(s.table_id) ?? 0) + 1);
    return ok({ tables: (tables ?? []).map((t) => ({ ...t, seated: seated.get(t.id) ?? 0 })) });
  });
}

/** Stakes allowlist (sb/bb in cents, Brasa benchmark). Rake is fixed at 500 bps, no cap, no-flop-no-drop. */
const STAKES: ReadonlyArray<readonly [number, number]> = [
  [5, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 500], [500, 1000],
];
const MAX_SEATS: ReadonlySet<number> = new Set([2, 6, 9]);
const RAKE_BPS = 500;
const MIN_BUYIN_BB = 40;
const MAX_BUYIN_BB = 200;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJson(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 40) throw new ApiError(400, 'BAD_REQUEST', 'name must have 2..40 chars');
    const sb = intField(body, 'sb', { min: 1, required: true })!;
    const bb = intField(body, 'bb', { min: 1, required: true })!;
    if (!STAKES.some(([s, b]) => s === sb && b === bb)) {
      throw new ApiError(400, 'BAD_STAKES', `sb/bb must be one of ${STAKES.map(([s, b]) => `${s}/${b}`).join(', ')}`);
    }
    const maxSeats = intField(body, 'maxSeats') ?? 9;
    if (!MAX_SEATS.has(maxSeats)) throw new ApiError(400, 'BAD_REQUEST', 'maxSeats must be 2, 6 or 9');
    const rakeBps = intField(body, 'rakeBps') ?? RAKE_BPS;
    if (rakeBps !== RAKE_BPS) throw new ApiError(400, 'BAD_RAKE', `rakeBps is fixed at ${RAKE_BPS}`);
    if (body.rakeCap !== undefined && body.rakeCap !== null) throw new ApiError(400, 'BAD_RAKE', 'rakeCap must be null (no cap)');
    if (body.noFlopNoDrop !== undefined && body.noFlopNoDrop !== true) throw new ApiError(400, 'BAD_RAKE', 'noFlopNoDrop is always true');
    const lo = bb * MIN_BUYIN_BB;
    const hi = bb * MAX_BUYIN_BB;
    const minBuyin = intField(body, 'minBuyin') ?? lo;
    const maxBuyin = intField(body, 'maxBuyin') ?? hi;
    if (minBuyin < lo || maxBuyin > hi || minBuyin > maxBuyin) {
      throw new ApiError(400, 'BUYIN_RANGE', `buy-in range must be within ${lo}..${hi} (${MIN_BUYIN_BB}-${MAX_BUYIN_BB} bb) and min <= max`);
    }
    const actionSeconds = intField(body, 'actionSeconds', { min: 10, max: 60 }) ?? 20;

    // 3 tables per user per UTC day, counted + inserted atomically (RPC create_table_limited, migration 0002)
    const r = await rpcJson<{ id: string }>('create_table_limited', {
      p_user: user.id, p_name: name, p_sb: sb, p_bb: bb, p_max_seats: maxSeats,
      p_min_buyin: minBuyin, p_max_buyin: maxBuyin, p_action_seconds: actionSeconds,
    });
    return ok({ id: r.id }, 201);
  });
}
