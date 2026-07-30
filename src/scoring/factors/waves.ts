import type { FactorResult, ScoreInputs } from '../../types';
import { isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Waves (10 %).
 *
 * Ideal: 0.5–1.5 m at 7–12 s. Enough swell to colour the water and dislodge
 * prey along the dyke, long enough not to be a wind chop.
 *
 * Perfect (1.0) — height and period both ideal
 * Good    (0.8) — both merely acceptable
 * Poor    (0.3) — anything outside that
 */
export const WAVE_HEIGHT_IDEAL: [number, number] = [0.5, 1.5];
export const WAVE_HEIGHT_ACCEPTABLE: [number, number] = [0.3, 2];
export const WAVE_PERIOD_IDEAL: [number, number] = [7, 12];
export const WAVE_PERIOD_ACCEPTABLE: [number, number] = [5, 14];

function within(value: number, [min, max]: [number, number]): boolean {
  return value >= min && value <= max;
}

export function waveScore(height: number | null, period: number | null): number | null {
  const hasHeight = isNum(height);
  const hasPeriod = isNum(period);
  if (!hasHeight && !hasPeriod) return null;

  // Judge on whichever dimensions are available.
  const idealFlags: boolean[] = [];
  const acceptableFlags: boolean[] = [];

  if (hasHeight) {
    idealFlags.push(within(height, WAVE_HEIGHT_IDEAL));
    acceptableFlags.push(within(height, WAVE_HEIGHT_ACCEPTABLE));
  }
  if (hasPeriod) {
    idealFlags.push(within(period, WAVE_PERIOD_IDEAL));
    acceptableFlags.push(within(period, WAVE_PERIOD_ACCEPTABLE));
  }

  if (idealFlags.every(Boolean)) return 1;
  if (acceptableFlags.every(Boolean)) return 0.8;
  return 0.3;
}

export function wavesFactor(inputs: ScoreInputs): FactorResult {
  const { waveHeight, wavePeriod } = inputs;
  const score = waveScore(waveHeight, wavePeriod);

  return {
    key: 'waves',
    value: score ?? NEUTRAL_FACTOR_VALUE,
    weight: WEIGHTS.waves,
    detail: { waveHeight: waveHeight ?? null, wavePeriod: wavePeriod ?? null },
    estimated: score === null || !isNum(waveHeight) || !isNum(wavePeriod),
  };
}
