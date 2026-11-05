'use client';

import { useEffect, useState } from 'react';

/** Anel circular que esvazia até deadlineAt (epoch ms). totalMs = actionSeconds*1000. */
export function Timer({ deadlineAt, totalMs, size = 64, stroke = 4 }: { deadlineAt: number; totalMs: number; size?: number; stroke?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, deadlineAt - now);
  const frac = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = frac > 0.5 ? '#e6b955' : frac > 0.25 ? '#f08c2e' : '#e0423c';
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90 pointer-events-none" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        style={{ transition: 'stroke-dashoffset 100ms linear' }}
      />
    </svg>
  );
}

export function useCountdown(deadlineAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (deadlineAt == null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}
