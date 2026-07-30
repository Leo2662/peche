import type { FactorResult, ScoreInputs } from '../../types';
import { clamp, isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Biological activity (35 %) — the dominant driver.
 *
 * BiologicalActivity = 0.4·TideCoefficient + 0.4·Current + 0.2·TidalRange
 */

/** Tide coefficient bands (spec). Bands are lower-inclusive. */
export function tideCoefficientScore(coefficient: number): number {
  if (coefficient >= 100) return 1;
  if (coefficient >= 80) return 0.9;
  if (coefficient >= 60) return 0.75;
  if (coefficient >= 40) return 0.5;
  return 0.3;
}

/**
 * Current bands (spec), in m/s. Bass hunt the strong tidal races along the
 * dyke, but above ~1.2 m/s the water scours and lures no longer swim true.
 */
export function currentScore(velocity: number): number {
  if (velocity >= 1.2) return 0.7;
  if (velocity >= 0.5) return 1;
  if (velocity >= 0.2) return 0.6;
  return 0.3;
}

/**
 * Tidal-range bands, normalised against the spot's mean spring range so the
 * same code works for a microtidal Mediterranean spot later on.
 */
export function tidalRangeScore(range: number, meanSpringRange: number): number {
  const ratio = range / meanSpringRange;
  if (ratio >= 0.9) return 1;
  if (ratio >= 0.72) return 0.85;
  if (ratio >= 0.55) return 0.7;
  if (ratio >= 0.36) return 0.5;
  return 0.3;
}

export function biologicalActivityFactor(inputs: ScoreInputs): FactorResult {
  const { tideCoefficient, currentVelocity, tidalRange, spot } = inputs;

  const coefficientSub = isNum(tideCoefficient) ? tideCoefficientScore(tideCoefficient) : null;
  const currentSub = isNum(currentVelocity) ? currentScore(currentVelocity) : null;
  const rangeSub = isNum(tidalRange) ? tidalRangeScore(tidalRange, spot.meanSpringRange) : null;

  const parts: Array<{ value: number | null; weight: number }> = [
    { value: coefficientSub, weight: 0.4 },
    { value: currentSub, weight: 0.4 },
    { value: rangeSub, weight: 0.2 },
  ];

  // Re-normalise over the sub-scores we actually have, so a missing current
  // reading does not drag the whole factor towards zero.
  const available = parts.filter((part) => part.value !== null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);

  const value =
    totalWeight === 0
      ? NEUTRAL_FACTOR_VALUE
      : clamp(
          available.reduce((sum, part) => sum + (part.value as number) * part.weight, 0) /
            totalWeight
        );

  return {
    key: 'biologicalActivity',
    value,
    weight: WEIGHTS.biologicalActivity,
    detail: {
      tideCoefficient: tideCoefficient ?? null,
      tideCoefficientScore: coefficientSub,
      currentVelocity: currentVelocity ?? null,
      currentScore: currentSub,
      tidalRange: tidalRange ?? null,
      tidalRangeScore: rangeSub,
    },
    estimated: available.length < parts.length,
  };
}
