import type { FactorResult, ScoreInputs } from '../../types';
import { isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Tide window (20 %).
 *
 * `hoursFromHighTide` is signed: negative before high water, positive after.
 *
 * Optimal (1.0) — the union of the three classic bass feeding windows:
 *   • the 2 hours before high water
 *   • the hour after high water
 *   • the first 2 hours of the ebb (which starts at high water)
 *   ⇒ −2 h … +2 h
 * Good (0.8)    — 2–3 h either side: the tide still runs hard.
 * Average (0.5) — 3–4 h either side: approaching slack low water.
 * Bad (0.2)     — beyond 4 h, i.e. around low water.
 */

export const TIDE_WINDOW_BANDS = {
  optimal: 2,
  good: 3,
  average: 4,
} as const;

export function tideWindowScore(hoursFromHighTide: number): number {
  const distance = Math.abs(hoursFromHighTide);
  if (distance <= TIDE_WINDOW_BANDS.optimal) return 1;
  if (distance <= TIDE_WINDOW_BANDS.good) return 0.8;
  if (distance <= TIDE_WINDOW_BANDS.average) return 0.5;
  return 0.2;
}

export function tideWindowFactor(inputs: ScoreInputs): FactorResult {
  const hours = inputs.hoursFromHighTide;
  const known = isNum(hours);

  return {
    key: 'tideWindow',
    value: known ? tideWindowScore(hours) : NEUTRAL_FACTOR_VALUE,
    weight: WEIGHTS.tideWindow,
    detail: { hoursFromHighTide: known ? Number(hours.toFixed(2)) : null },
    estimated: !known,
  };
}
