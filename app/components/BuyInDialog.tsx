'use client';

import { useState } from 'react';
import { fmtCents, fmtCentsShort, parseReais } from '@/lib/client/money';

export function BuyInDialog({ seat, min, max, balance, busy, error, onConfirm, onClose }: {
  seat: number;
  min: number;
  max: number;
  balance: number | null;
  busy: boolean;
  error: string | null;
  onConfirm: (buyin: number) => void;
  onClose: () => void;
}) {
  const cap = balance != null ? Math.min(max, balance) : max;
  const initial = Math.min(max, Math.max(min, cap));
  const [amount, setAmount] = useState<number>(initial);
  const [text, setText] = useState<string>('');
  const valid = amount >= min && amount <= max && (balance == null || amount <= balance);

  const set = (v: number) => { setAmount(Math.round(v)); setText(''); };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose} role="dialog" aria-label="Comprar fichas">
      <div className="panel w-full max-w-sm bg-[#101412] p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Sentar no assento {seat + 1}</h2>
        <p className="mt-1 text-sm text-white/60">
          Buy-in de {fmtCentsShort(min)} a {fmtCentsShort(max)}
          {balance != null && <> · saldo {fmtCents(balance)}</>}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-white/70">R$</span>
          <input
            className="input font-mono"
            inputMode="decimal"
            value={text !== '' ? text : (amount / 100).toFixed(2).replace('.', ',')}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text !== '') set(parseReais(text)); }}
            aria-label="Valor do buy-in"
          />
        </div>
        <input type="range" className="mt-2" min={min} max={max} step={Math.max(1, Math.round((max - min) / 100))} value={Math.min(max, Math.max(min, amount))} onChange={(e) => set(Number(e.target.value))} aria-label="Slider do buy-in" />
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => set(min)}>Mín</button>
          <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => set(Math.round((min + max) / 2))}>Médio</button>
          <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => set(cap)}>Máx</button>
        </div>
        {!valid && <p className="mt-2 text-xs text-red-300">{balance != null && amount > balance ? 'Saldo insuficiente — pegue fichas de teste no lobby.' : 'Valor fora do intervalo permitido.'}</p>}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-gold" onClick={() => onConfirm(amount)} disabled={busy || !valid}>
            {busy ? 'Sentando…' : `Sentar com ${fmtCentsShort(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
