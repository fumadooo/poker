'use client';

import { useState } from 'react';
import { parseReais } from '@/lib/client/money';
import type { CreateTableBody } from '@/lib/client/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      {children}
    </label>
  );
}

export function CreateTableForm({ busy, error, onSubmit, onCancel }: {
  busy: boolean;
  error: string | null;
  onSubmit: (body: CreateTableBody) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [sb, setSb] = useState('0,50');
  const [bb, setBb] = useState('1,00');
  const [maxSeats, setMaxSeats] = useState(9);
  const [rakeBps, setRakeBps] = useState(500);
  const [rakeCap, setRakeCap] = useState('');
  const [minBuyin, setMinBuyin] = useState('40,00');
  const [maxBuyin, setMaxBuyin] = useState('200,00');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: CreateTableBody = {
      name: name.trim(),
      sb: parseReais(sb),
      bb: parseReais(bb),
      maxSeats,
      rakeBps,
      rakeCap: rakeCap.trim() ? parseReais(rakeCap) : null,
      minBuyin: parseReais(minBuyin),
      maxBuyin: parseReais(maxBuyin),
    };
    if (!body.name) return setLocalError('Dê um nome à mesa.');
    if (body.sb <= 0 || body.bb <= 0 || body.sb > body.bb) return setLocalError('Blinds inválidos (SB ≤ BB, ambos > 0).');
    if (body.minBuyin <= 0 || body.maxBuyin < body.minBuyin) return setLocalError('Buy-in inválido (mín ≤ máx).');
    setLocalError(null);
    onSubmit(body);
  };

  return (
    <form onSubmit={submit} className="panel fade-in flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">Criar mesa</h2>
      <Field label="Nome">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ipanema" maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Small blind (R$)"><input className="input font-mono" inputMode="decimal" value={sb} onChange={(e) => setSb(e.target.value)} /></Field>
        <Field label="Big blind (R$)"><input className="input font-mono" inputMode="decimal" value={bb} onChange={(e) => setBb(e.target.value)} /></Field>
        <Field label="Buy-in mínimo (R$)"><input className="input font-mono" inputMode="decimal" value={minBuyin} onChange={(e) => setMinBuyin(e.target.value)} /></Field>
        <Field label="Buy-in máximo (R$)"><input className="input font-mono" inputMode="decimal" value={maxBuyin} onChange={(e) => setMaxBuyin(e.target.value)} /></Field>
        <Field label="Assentos">
          <select className="input" value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))}>
            {[2, 6, 9].map((n) => <option key={n} value={n}>{n} lugares</option>)}
          </select>
        </Field>
        <Field label="Rake (bps)">
          <select className="input" value={rakeBps} onChange={(e) => setRakeBps(Number(e.target.value))}>
            {[0, 250, 500].map((n) => <option key={n} value={n}>{n / 100}%</option>)}
          </select>
        </Field>
        <Field label="Teto do rake (R$, vazio = sem teto)"><input className="input font-mono" inputMode="decimal" value={rakeCap} onChange={(e) => setRakeCap(e.target.value)} placeholder="sem teto" /></Field>
      </div>
      {(localError || error) && <p className="text-xs text-red-300">{localError || error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn btn-gold" disabled={busy}>{busy ? 'Criando…' : 'Criar mesa'}</button>
      </div>
    </form>
  );
}
