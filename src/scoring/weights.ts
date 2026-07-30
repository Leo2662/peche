import type { FactorKey } from '../types';

/**
 * Sea Bass Index weights. Must sum to 1.
 *
 * Score = 100 × (
 *   0.35·BiologicalActivity + 0.20·TideWindow + 0.15·Wind +
 *   0.10·Waves + 0.08·Light + 0.07·WaterTemperature + 0.05·Pressure
 * )
 */
export const WEIGHTS: Record<FactorKey, number> = {
  biologicalActivity: 0.35,
  tideWindow: 0.2,
  wind: 0.15,
  waves: 0.1,
  light: 0.08,
  waterTemperature: 0.07,
  pressure: 0.05,
};

export const FACTOR_ORDER: FactorKey[] = [
  'biologicalActivity',
  'tideWindow',
  'wind',
  'waves',
  'light',
  'waterTemperature',
  'pressure',
];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  biologicalActivity: 'Biological activity',
  tideWindow: 'Tide window',
  wind: 'Wind',
  waves: 'Waves',
  light: 'Light',
  waterTemperature: 'Water temperature',
  pressure: 'Pressure',
};

/**
 * Used when an input is unavailable: a missing factor should neither reward nor
 * punish the spot, so it contributes at the middle of its range.
 */
export const NEUTRAL_FACTOR_VALUE = 0.5;
