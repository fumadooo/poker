// Espelho (somente UI/MOCK) do allowlist do servidor em app/api/tables/route.ts. O servidor continua sendo a autoridade.

/** Pares sb/bb permitidos, em centavos. */
export const STAKES: ReadonlyArray<readonly [number, number]> = [
  [5, 10], [10, 25], [25, 50], [50, 100], [100, 200], [200, 500], [500, 1000],
];
export const MAX_SEATS_OPTIONS = [2, 6, 9] as const;
export const RAKE_BPS = 500;
export const MIN_BUYIN_BB = 40;
export const MAX_BUYIN_BB = 200;
export const TABLES_PER_DAY = 3;

export const buyinRange = (bb: number) => ({ min: bb * MIN_BUYIN_BB, max: bb * MAX_BUYIN_BB });
