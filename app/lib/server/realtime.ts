// Broadcast { version } on channel `table:<id>` (event `state`) through the stateless Realtime REST endpoint.
// Clients re-fetch GET /api/table/[id]/state on receipt; cards never travel over broadcast.
export async function broadcast(tableId: string, version: number): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `table:${tableId}`, event: 'state', payload: { version } }] }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.warn('[realtime] broadcast failed', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.warn('[realtime] broadcast error', e instanceof Error ? e.message : e);
  }
}
