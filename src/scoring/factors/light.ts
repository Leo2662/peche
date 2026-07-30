import type { FactorResult, ScoreInputs, SunTimes } from '../../types';
import { clamp, isNum } from '../../utils/math';
import { HOUR } from '../../utils/time';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Light (8 %) — LightScore = 0.7·Twilight + 0.3·Cloud
 *
 * Bass are crepuscular hunters: the golden hours either side of sunrise and
 * sunset are prime, full darkness is still good, flat midday sun is worst.
 * Heavy cloud lengthens the low-light period and lifts the whole day.
 */

/** Hours to the nearer of sunrise and sunset. */
export function hoursToTwilight(time: number, sun: SunTimes): number {
  return Math.min(Math.abs(time - sun.sunrise), Math.abs(time - sun.sunset)) / HOUR;
}

export function isDaylight(time: number, sun: SunTimes): boolean {
  return time >= sun.sunrise && time <= sun.sunset;
}

export function twilightScore(time: number, sun: SunTimes): number {
  const distance = hoursToTwilight(time, sun);
  if (distance <= 1) return 1;
  if (distance <= 2) return 0.75;
  // Night still fishes well; broad daylight does not.
  return isDaylight(time, sun) ? 0.35 : 0.6;
}

export function cloudScore(cloudCover: number): number {
  if (cloudCover >= 70) return 1;
  if (cloudCover >= 40) return 0.8;
  if (cloudCover >= 20) return 0.6;
  return 0.45;
}

export function lightFactor(inputs: ScoreInputs): FactorResult {
  const { time, sun, cloudCover } = inputs;

  const twilightSub = sun ? twilightScore(time, sun) : null;
  const cloudSub = isNum(cloudCover) ? cloudScore(cloudCover) : null;

  if (twilightSub === null && cloudSub === null) {
    return {
      key: 'light',
      value: NEUTRAL_FACTOR_VALUE,
      weight: WEIGHTS.light,
      detail: { twilightScore: null, cloudScore: null, cloudCover: null },
      estimated: true,
    };
  }

  const parts: Array<{ value: number | null; weight: number }> = [
    { value: twilightSub, weight: 0.7 },
    { value: cloudSub, weight: 0.3 },
  ];
  const available = parts.filter((part) => part.value !== null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);

  const value = clamp(
    available.reduce((sum, part) => sum + (part.value as number) * part.weight, 0) / totalWeight
  );

  return {
    key: 'light',
    value,
    weight: WEIGHTS.light,
    detail: {
      twilightScore: twilightSub,
      cloudScore: cloudSub,
      cloudCover: cloudCover ?? null,
      hoursToTwilight: sun ? Number(hoursToTwilight(time, sun).toFixed(2)) : null,
    },
    estimated: available.length < parts.length,
  };
}
