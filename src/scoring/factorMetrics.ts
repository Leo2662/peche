import type { FactorKey, FactorResult, ScoreResult } from '../types';
import { isNum } from '../utils/math';

/**
 * The measured quantities behind a factor, for the detail view.
 *
 * Like `explain.ts`, this returns identifiers and raw numbers — no words, no
 * units, no formatting. `src/utils/format.ts` turns a metric into French text.
 *
 * The first metric of a factor is its headline: the one figure that best
 * explains it. Everything after is supporting detail.
 */
export type MetricKey =
  | 'currentVelocity'
  | 'tideCoefficient'
  | 'tidalRange'
  | 'hoursFromHighTide'
  | 'windSpeed'
  | 'windGusts'
  | 'windDirection'
  | 'waveHeight'
  | 'wavePeriod'
  | 'cloudCover'
  | 'hoursToTwilight'
  | 'seaTemperature'
  | 'pressureTrend6h';

export interface Metric {
  key: MetricKey;
  value: number;
}

/** Which raw readings each factor exposes, headline first. */
const METRICS_BY_FACTOR: Record<FactorKey, MetricKey[]> = {
  biologicalActivity: ['currentVelocity', 'tideCoefficient', 'tidalRange'],
  tideWindow: ['hoursFromHighTide'],
  // The reason word already names the sector, so the speed is the headline.
  wind: ['windSpeed', 'windGusts', 'windDirection'],
  waves: ['waveHeight', 'wavePeriod'],
  light: ['cloudCover', 'hoursToTwilight'],
  waterTemperature: ['seaTemperature'],
  pressure: ['pressureTrend6h'],
};

export function factorMetrics(factor: FactorResult): Metric[] {
  return METRICS_BY_FACTOR[factor.key]
    .map((key) => ({ key, value: factor.detail[key] }))
    .filter((metric): metric is Metric => isNum(metric.value));
}

/** Metrics for the factor a reason came from. */
export function metricsForFactor(peak: ScoreResult, key: FactorKey): Metric[] {
  return factorMetrics(peak.factors[key]);
}
