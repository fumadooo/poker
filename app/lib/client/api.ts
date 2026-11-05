'use client';

// Helpers tipados para a API de docs/SPEC-contracts-v1.md §3. Cookies sempre enviados (credentials: 'include').
// Com NEXT_PUBLIC_MOCK=1 tudo é respondido em memória por ./mock.ts.

import { MOCK } from './supabase';
import { mockApi } from './mock';
import type { ActionBody, ApiError, CreateTableBody, MeInfo, TablePublic, TableStateResponse } from './types';
import { ApiRequestError } from './types';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* corpo vazio */
  }
  if (!res.ok || (body && typeof body === 'object' && (body as ApiError).ok === false)) {
    const err = (body || {}) as Partial<ApiError>;
    throw new ApiRequestError(res.status, err.error || `HTTP_${res.status}`, err.message);
  }
  return body as T;
}

function post<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: data === undefined ? '{}' : JSON.stringify(data) });
}

const tablePath = (id: string, tail: string) => `/api/table/${encodeURIComponent(id)}/${tail}`;

export const api = {
  /** GET /api/me → { ok, id, email, nick, balance }. Ponto de integração: não está no SPEC §3; A1 precisa expor. */
  getMe(): Promise<MeInfo> {
    if (MOCK) return mockApi.getMe();
    return request<{ ok: true } & MeInfo>('/api/me');
  },
  /** POST /api/me/credit → +R$ 1.000 em fichas de teste (máx. 5/dia). */
  credit(): Promise<{ balance: number }> {
    if (MOCK) return mockApi.credit();
    return post<{ ok: true; balance: number }>('/api/me/credit');
  },
  /** GET /api/tables → { ok, tables: tables_public + seated }. */
  async listTables(): Promise<TablePublic[]> {
    if (MOCK) return mockApi.listTables();
    const r = await request<{ ok: true; tables: TablePublic[] }>('/api/tables');
    return r.tables;
  },
  /** POST /api/tables → { ok, id } */
  createTable(body: CreateTableBody): Promise<{ id: string }> {
    if (MOCK) return mockApi.createTable(body);
    return post<{ ok: true; id: string }>('/api/tables', body);
  },
  /** GET /api/table/[id]/state */
  getState(id: string): Promise<TableStateResponse> {
    if (MOCK) return mockApi.getState(id);
    return request<TableStateResponse>(tablePath(id, 'state'));
  },
  /** POST /api/table/[id]/sit { seat, buyin } */
  sit(id: string, seat: number, buyin: number): Promise<{ ok: true }> {
    if (MOCK) return mockApi.sit(id, seat, buyin);
    return post<{ ok: true }>(tablePath(id, 'sit'), { seat, buyin });
  },
  /** POST /api/table/[id]/leave → { ok, pending? } (pending = sai ao fim da mão) */
  leave(id: string): Promise<{ ok: true; pending?: boolean }> {
    if (MOCK) return mockApi.leave(id);
    return post<{ ok: true; pending?: boolean }>(tablePath(id, 'leave'));
  },
  /** POST /api/table/[id]/action { action, amount?, version } — 409 VERSION_CONFLICT tratado pelo chamador. */
  action(id: string, body: ActionBody): Promise<{ ok: true; version?: number }> {
    if (MOCK) return mockApi.action(id, body);
    return post<{ ok: true; version?: number }>(tablePath(id, 'action'), body);
  },
  /** POST /api/table/[id]/tick — aplica timeout vencido / inicia próxima mão. Idempotente. */
  tick(id: string): Promise<{ ok: true; changed?: boolean }> {
    if (MOCK) return mockApi.tick(id);
    return post<{ ok: true; changed?: boolean }>(tablePath(id, 'tick'));
  },
};

export { ApiRequestError };
