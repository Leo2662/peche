import * as SunCalc from 'suncalc';

import type { MoonInfo, SunTimes } from '../types';

/**
 * Sun and moon are computed locally with SunCalc — no API call, so both work
 * offline and stay correct even when every network request fails.
 */

const PHASE_LABELS: Array<{ max: number; label: string }> = [
  { max: 0.03, label: 'New moon' },
  { max: 0.22, label: 'Waxing crescent' },
  { max: 0.28, label: 'First quarter' },
  { max: 0.47, label: 'Waxing gibbous' },
  { max: 0.53, label: 'Full moon' },
  { max: 0.72, label: 'Waning gibbous' },
  { max: 0.78, label: 'Last quarter' },
  { max: 0.97, label: 'Waning crescent' },
  { max: 1.01, label: 'New moon' },
];

export function getMoonInfo(timestamp: number): MoonInfo {
  const { phase, fraction } = SunCalc.getMoonIllumination(new Date(timestamp));
  const label = PHASE_LABELS.find((entry) => phase < entry.max)?.label ?? 'New moon';
  return { phase, illumination: fraction, label };
}

/**
 * Sunrise/sunset for the calendar day containing `timestamp` at the given
 * coordinates. Returns null above the polar circles when the sun neither rises
 * nor sets — the light factor then falls back to a neutral value.
 */
export function getSunTimes(timestamp: number, latitude: number, longitude: number): SunTimes | null {
  const times = SunCalc.getTimes(new Date(timestamp), latitude, longitude);
  const sunrise = times.sunrise?.getTime();
  const sunset = times.sunset?.getTime();

  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)) return null;
  return { sunrise: sunrise as number, sunset: sunset as number };
}
