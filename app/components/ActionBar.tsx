'use client';

import { useMemo, useState } from 'react';
import { fmtCents, fmtCentsShort, parseReais } from '@/lib/client/money';
import type { ActionKind, LegalActions } from '@/lib/client/types';

export interface ActionBarProps {
  legal: LegalActions | null; // vem da API; null = não é a minha vez
  potTotal: number; // soma de state.pots (o motor já inclui as apostas da rua) — só para os atalhos
  currentBet: number;
  busy: boolean;
  secondsLeft: number | null;
  onAction: (action: ActionKind, amount?: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ActionBar({ legal, potTotal, currentBet, busy, secondsLeft, onAction }: ActionBarProps) {
  const sizing = legal?.raise ?? legal?.bet ?? null;
  const isRaise = !!legal?.raise;
  const [amount, setAmount] = useState<number>(sizing?.min ?? 0);
  const [text, setText] = useState<string>('');

  // reinicia o valor quando a janela de aposta muda (nova vez / nova rua) — ajuste de estado durante o render
  const sizingKey = sizing ? `${sizing.min}:${sizing.max}` : '';
  const [prevKey, setPrevKey] = useState(sizingKey);
  if (sizingKey !== prevKey) {
    setPrevKey(sizingKey);
    setAmount(sizing?.min ?? 0);
    setText('');
  }

  const presets = useMemo(() => {
    if (!sizing) return [];
    const toCall = legal?.call ?? 0;
    const potAfterCall = potTotal + toCall;
    // raise é raise-TO: pagar até currentBet e aumentar o pote-depois-do-call; bet = fichas na rua
    const base = isRaise ? currentBet : 0;
    const list = [
      { label: 'Mín', value: sizing.min },
      { label: '½ pote', value: base + Math.floor(potAfterCall / 2) },
      { label: 'Pote', value: base + potAfterCall },
      { label: 'All-in', value: sizing.max },
    ];
    return list.map((p) => ({ ...p, value: clamp(p.value, sizing.min, sizing.max) }));
  }, [sizing, legal?.call, potTotal, currentBet, isRaise]);

  if (!legal) {
    return (
      <div className="panel flex items-center justify-center px-4 py-3 text-sm text-white/60">
        Aguardando a vez…
      </div>
    );
  }

  const disabled = busy;
  const setAmt = (v: number) => {
    const c = sizing ? clamp(Math.round(v), sizing.min, sizing.max) : v;
    setAmount(c);
    setText('');
  };
  const step = sizing ? Math.max(1, Math.round((sizing.max - sizing.min) / 200)) : 1;

  return (
    <div className="panel flex flex-col gap-2 p-2 sm:gap-3 sm:p-3">
      {sizing && (
        <div className="order-2 flex flex-col gap-2 sm:order-none">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">{isRaise ? 'Aumentar para' : 'Apostar'}</span>
            <input
              className="input !w-32 !py-1.5 text-right font-mono"
              inputMode="decimal"
              value={text !== '' ? text : (amount / 100).toFixed(2).replace('.', ',')}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => { if (text !== '') setAmt(parseReais(text)); }}
              aria-label="Valor da aposta em reais"
            />
            <span className="ml-auto text-xs text-white/50">
              {fmtCentsShort(sizing.min)} – {fmtCentsShort(sizing.max)}
            </span>
          </div>
          <input
            type="range"
            min={sizing.min}
            max={sizing.max}
            step={step}
            value={amount}
            onChange={(e) => setAmt(Number(e.target.value))}
            aria-label="Slider do valor"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {presets.map((p) => (
              <button key={p.label} type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => setAmt(p.value)} disabled={disabled}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="order-1 grid grid-cols-3 gap-2 sm:order-none">
        <button type="button" className="btn btn-fold" disabled={disabled || !legal.fold} onClick={() => onAction('fold')}>
          Desistir
        </button>
        {legal.check ? (
          <button type="button" className="btn btn-check" disabled={disabled} onClick={() => onAction('check')}>
            Passar
          </button>
        ) : (
          <button type="button" className="btn btn-call" disabled={disabled || legal.call == null} onClick={() => onAction('call')}>
            Pagar {legal.call != null ? fmtCentsShort(legal.call) : ''}
          </button>
        )}
        {sizing ? (
          <button
            type="button"
            className="btn btn-raise"
            disabled={disabled}
            onClick={() => onAction(amount >= sizing.max ? 'allin' : isRaise ? 'raise' : 'bet', amount >= sizing.max ? undefined : amount)}
          >
            {amount >= sizing.max ? 'All-in' : isRaise ? 'Aumentar' : 'Apostar'} {fmtCentsShort(amount)}
          </button>
        ) : legal.allin > 0 && !(legal.call != null && legal.call >= legal.allin) ? (
          <button type="button" className="btn btn-raise" disabled={disabled} onClick={() => onAction('allin')}>
            All-in {fmtCentsShort(legal.allin)}
          </button>
        ) : (
          <button type="button" className="btn btn-raise" disabled>
            Aumentar
          </button>
        )}
      </div>
      {secondsLeft != null && (
        <div className="text-center text-[11px] text-white/50">
          Sua vez · {secondsLeft}s · pote {fmtCents(potTotal)}
        </div>
      )}
    </div>
  );
}
