const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const brlShort = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 123456 → "R$ 1.234,56" */
export function fmtCents(cents: number): string {
  return brl.format((cents || 0) / 100);
}

/** 100000 → "R$ 1.000"; 150 → "R$ 1,50" */
export function fmtCentsShort(cents: number): string {
  const v = (cents || 0) / 100;
  return Number.isInteger(v) ? brlShort.format(v) : brl.format(v);
}

/** "1.000,50" | "1000.5" | "1000" → centavos (inteiro) */
export function parseReais(input: string): number {
  const s = input.trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const v = Number(normalized);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

export function blindsLabel(sb: number, bb: number): string {
  return `${fmtCentsShort(sb)} / ${fmtCentsShort(bb)}`;
}
