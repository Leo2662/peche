import type { FactorKey, FactorResult, ScoreInputs, ScoreResult, Verdict } from '../types';
import { STRINGS } from '../config/strings';
import { clamp } from '../utils/math';
import { biologicalActivityFactor } from './factors/biologicalActivity';
import { lightFactor } from './factors/light';
import { pressureFactor } from './factors/pressure';
import { tideWindowFactor } from './factors/tideWindow';
import { waterTemperatureFactor } from './factors/waterTemperature';
import { wavesFactor } from './factors/waves';
import { windFactor } from './factors/wind';
import { FACTOR_ORDER } from './weights';

const FACTOR_FNS: Record<FactorKey, (inputs: ScoreInputs) => FactorResult> = {
  biologicalActivity: biologicalActivityFactor,
  tideWindow: tideWindowFactor,
  wind: windFactor,
  waves: wavesFactor,
  light: lightFactor,
  waterTemperature: waterTemperatureFactor,
  pressure: pressureFactor,
};

/**
 * The Sea Bass Index.
 *
 * Pure function: same inputs, same score, no clock and no I/O. Everything the
 * UI shows is derived from this.
 */
export function computeScore(inputs: ScoreInputs): ScoreResult {
  const factors = {} as Record<FactorKey, FactorResult>;
  let weighted = 0;
  let partial = false;

  for (const key of FACTOR_ORDER) {
    const result = FACTOR_FNS[key](inputs);
    factors[key] = result;
    weighted += result.value * result.weight;
    if (result.estimated) partial = true;
  }

  return {
    time: inputs.time,
    score: Math.round(clamp(weighted, 0, 1) * 100),
    factors,
    partial,
  };
}

/**
 * Verdict bands. The colour thresholds are fixed by the design spec
 * (90+ green, 70–89 yellow, below 70 red); AVERAGE and POOR share the red
 * accent but read differently in copy.
 */
export function getVerdict(score: number): Verdict {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'AVERAGE';
  return 'POOR';
}

export const VERDICT_LABELS: Record<Verdict, string> = STRINGS.verdict;
