// JSON helpers for the API: { ok:true, ... } or { ok:false, error:'CODE', message } (SPEC §3).
import { NextResponse, type NextRequest } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { userFromRequest } from './supabase';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function ok(body: Record<string, unknown> = {}, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { status, headers: NO_STORE });
}

export function fail(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json({ ok: false, error: code, message: message ?? code }, { status, headers: NO_STORE });
}

/** Wrap a handler: ApiError → its status/code; anything else → 500 INTERNAL (logged, message kept generic). */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // Next internals (prerender bail-out, dynamic usage) must propagate
    if (e instanceof ApiError) return fail(e.status, e.code, e.message);
    console.error('[api] internal error', e);
    return fail(500, 'INTERNAL', 'internal error');
  }
}

export async function requireUser(req: NextRequest): Promise<User> {
  const u = await userFromRequest(req);
  if (!u) throw new ApiError(401, 'UNAUTHORIZED', 'login required');
  return u;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function intField(body: Record<string, unknown>, name: string, opts: { min?: number; max?: number; required?: boolean; nullable?: boolean } = {}): number | null {
  const v = body[name];
  if (v === undefined || v === null) {
    if (opts.required) throw new ApiError(400, 'BAD_REQUEST', `${name} is required`);
    return null;
  }
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ApiError(400, 'BAD_REQUEST', `${name} must be an integer`);
  if (opts.min !== undefined && v < opts.min) throw new ApiError(400, 'BAD_REQUEST', `${name} must be >= ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new ApiError(400, 'BAD_REQUEST', `${name} must be <= ${opts.max}`);
  return v;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(id: string): string {
  if (!UUID_RE.test(id)) throw new ApiError(404, 'TABLE_NOT_FOUND', 'invalid table id');
  return id.toLowerCase();
}
