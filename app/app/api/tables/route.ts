// GET  /api/tables -> { ok, tables: tables_public rows + seated count }   (public, no auth)
// POST /api/tables { name, sb, bb, maxSeats, rakeBps, rakeCap, minBuyin, maxBuyin } -> { ok, id }
import { connection, type NextRequest } from 'next/server';
import { ApiError, handle, intField, ok, readJson, requireUser } from '@/lib/server/http';
import { admin } from '@/lib/server/supabase';


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

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJson(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 40) throw new ApiError(400, 'BAD_REQUEST', 'name must have 2..40 chars');
    const sb = intField(body, 'sb', { min: 1, required: true })!;
    const bb = intField(body, 'bb', { min: sb, required: true })!;
    const maxSeats = intField(body, 'maxSeats', { min: 2, max: 9 }) ?? 9;
    const rakeBps = intField(body, 'rakeBps', { min: 0, max: 10000 }) ?? 500;
    const rakeCap = intField(body, 'rakeCap', { min: 0 });
    const minBuyin = intField(body, 'minBuyin', { min: 1 }) ?? bb * 20;
    const maxBuyin = intField(body, 'maxBuyin', { min: minBuyin }) ?? bb * 100;
    const actionSeconds = intField(body, 'actionSeconds', { min: 5, max: 120 }) ?? 20;
    const noFlopNoDrop = typeof body.noFlopNoDrop === 'boolean' ? body.noFlopNoDrop : true;

    const { data, error } = await admin()
      .from('tables')
      .insert({
        name,
        game: 'nlh',
        sb_cents: sb,
        bb_cents: bb,
        max_seats: maxSeats,
        min_buyin_cents: minBuyin,
        max_buyin_cents: maxBuyin,
        rake_bps: rakeBps,
        rake_cap_cents: rakeCap,
        no_flop_no_drop: noFlopNoDrop,
        action_seconds: actionSeconds,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error) throw new ApiError(500, 'DB_ERROR', 'create table: ' + error.message);
    return ok({ id: data.id }, 201);
  });
}
