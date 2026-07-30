import type { FactorResult, ScoreInputs } from '../../types';
import { clamp, isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Water temperature (7 %).
 *
 * TemperatureScore = 1 − |T − 16| / 12, clamped to 0–1.
 * 16 °C is the sea-bass optimum; the score reaches 0 at 4 °C and 28 °C.
 */
export const IDEAL_SEA_TEMPERATURE = 16;
export const TEMPERATURE_TOLERANCE = 12;

export function temperatureScore(celsius: number): number {
  return clamp(1 - Math.abs(celsius - IDEAL_SEA_TEMPERATURE) / TEMPERATURE_TOLERANCE);
}

export function waterTemperatureFactor(inputs: ScoreInputs): FactorResult {
  const temperature = inputs.seaTemperature;
  const known = isNum(temperature);

  return {
    key: 'waterTemperature',
    value: known ? temperatureScore(temperature) : NEUTRAL_FACTOR_VALUE,
    weight: WEIGHTS.waterTemperature,
    detail: { seaTemperature: known ? temperature : null },
    estimated: !known,
  };
}
