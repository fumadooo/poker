'use client';

import { useState } from 'react';
import { fmtCents } from '@/lib/client/money';
import { buyinRange, MAX_BUYIN_BB, MAX_SEATS_OPTIONS, MIN_BUYIN_BB, RAKE_BPS, STAKES } from '@/lib/client/tableRules';
import type { CreateTableBody } from '@/lib/client/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      {children}
    </label>
  );
}

function ReadOnly({ value }: { value: string }) {
  return <div className="input font-mono text-white/70" aria-readonly="true">{value}</div>;
}

export function CreateTableForm({ busy, error, onSubmit, onCancel }: {
  busy: boolean;
  error: string | null;
  onSubmit: (body: CreateTableBody) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [stakeIdx, setStakeIdx] = useState(3); // R$ 0,50 / R$ 1,00
  const [maxSeats, setMaxSeats] = useState<number>(9);
  const [localError, setLocalError] = useState<string | null>(null);

  const [sb, bb] = STAKES[stakeIdx];
  const { min, max } = buyinRange(bb);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setLocalError('Dê um nome à mesa (2 a 40 caracteres).');
    setLocalError(null);
    onSubmit({ name: trimmed, sb, bb, maxSeats, rakeBps: RAKE_BPS, rakeCap: null, minBuyin: min, maxBuyin: max });
  };

  return (
    <form onSubmit={submit} className="panel fade-in flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">Criar mesa</h2>
      <Field label="Nome">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ipanema" maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Blinds (SB / BB)">
          <select className="input font-mono" value={stakeIdx} onChange={(e) => setStakeIdx(Number(e.target.value))}>
            {STAKES.map(([s, b], i) => <option key={`${s}/${b}`} value={i}>{fmtCents(s)} / {fmtCents(b)}</option>)}
          </select>
        </Field>
        <Field label="Assentos">
          <select className="input" value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))}>
            {MAX_SEATS_OPTIONS.map((n) => <option key={n} value={n}>{n} lugares</option>)}
          </select>
        </Field>
        <Field label={`Buy-in mínimo (${MIN_BUYIN_BB} BB)`}><ReadOnly value={fmtCents(min)} /></Field>
        <Field label={`Buy-in máximo (${MAX_BUYIN_BB} BB)`}><ReadOnly value={fmtCents(max)} /></Field>
        <Field label="Rake"><ReadOnly value={`${RAKE_BPS / 100}% · sem teto`} /></Field>
      </div>
      <p className="text-[11px] text-white/40">Limite: 3 mesas criadas por dia por usuário.</p>
      {(localError || error) && <p className="text-xs text-red-300" role="alert">{localError || error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn btn-gold" disabled={busy}>{busy ? 'Criando…' : 'Criar mesa'}</button>
      </div>
    </form>
  );
}
