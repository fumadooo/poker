import type { TableConfig } from './types.js';

/**
 * Rake for a pot: floor(pot * rakeBps / 10000), capped at rakeCap (cents) when set,
 * zero when noFlopNoDrop and the hand ended before a flop. Never exceeds the pot.
 */
export function computeRake(pot: number, config: TableConfig, sawFlop: boolean): number {
  if (!Number.isInteger(pot) || pot <= 0) return 0;
  if (config.noFlopNoDrop && !sawFlop) return 0;
  const bps = Math.max(0, Math.floor(config.rakeBps || 0));
  let r = Math.floor((pot * bps) / 10000);
  if (config.rakeCap !== null && config.rakeCap !== undefined) {
    r = Math.min(r, Math.max(0, Math.floor(config.rakeCap)));
  }
  return Math.min(r, pot);
}
