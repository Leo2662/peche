import type { FactorResult, ScoreInputs } from '../../types';
import { isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Pressure (5 %).
 *
 * Judged on the magnitude of the change over the previous 6 hours: bass feed
 * confidently in a settled airmass and go off the feed while a front crosses.
 *
 *   0–2 hPa  → 1    (stable)
 *   2–5 hPa  → 0.7  (moderate)
 *   > 5 hPa  → 0.3  (frontal passage)
 */
export function pressureScore(trend6h: number): number {
  const magnitude = Math.abs(trend6h);
  if (magnitude <= 2) return 1;
  if (magnitude <= 5) return 0.7;
  return 0.3;
}

export function pressureFactor(inputs: ScoreInputs): FactorResult {
  const trend = inputs.pressureTrend6h;
  const known = isNum(trend);

  return {
    key: 'pressure',
    value: known ? pressureScore(trend) : NEUTRAL_FACTOR_VALUE,
    weight: WEIGHTS.pressure,
    detail: { pressureTrend6h: known ? Number(trend.toFixed(2)) : null },
    estimated: !known,
  };
}
