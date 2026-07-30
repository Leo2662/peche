import { isNum, lerp } from './math';

export interface TimedSample {
  time: number;
}

/**
 * Linearly interpolate a field of a time-sorted series at an arbitrary instant.
 *
 * The APIs publish hourly steps; the score timeline runs at 10 minutes, so
 * every input is interpolated rather than held constant across the hour — that
 * is what lets the best window resolve to "19:10 – 21:00" instead of "19:00".
 *
 * Returns null outside the series, or when no bracketing samples carry a value.
 */
export function sampleSeries<T extends TimedSample>(
  samples: T[],
  time: number,
  pick: (sample: T) => number | null | undefined
): number | null {
  if (samples.length === 0) return null;

  // Binary search for the first sample at or after `time`.
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].time < time) low = mid + 1;
    else high = mid;
  }

  const rightIndex = low;
  const right = samples[rightIndex];

  if (right.time === time) {
    const exact = pick(right);
    if (isNum(exact)) return exact;
  }

  // Nearest usable sample on each side (skipping gaps in this particular field).
  let before: { time: number; value: number } | null = null;
  for (let i = right.time <= time ? rightIndex : rightIndex - 1; i >= 0; i -= 1) {
    const value = pick(samples[i]);
    if (isNum(value)) {
      before = { time: samples[i].time, value };
      break;
    }
  }

  let after: { time: number; value: number } | null = null;
  for (let i = right.time >= time ? rightIndex : rightIndex + 1; i < samples.length; i += 1) {
    const value = pick(samples[i]);
    if (isNum(value)) {
      after = { time: samples[i].time, value };
      break;
    }
  }

  if (before && after) {
    if (after.time === before.time) return before.value;
    const t = (time - before.time) / (after.time - before.time);
    return lerp(before.value, after.value, t);
  }

  // Outside the series: hold the closest known value rather than inventing one.
  return before?.value ?? after?.value ?? null;
}

/** True when at least one sample carries a usable value for the field. */
export function hasField<T extends TimedSample>(
  samples: T[],
  pick: (sample: T) => number | null | undefined
): boolean {
  return samples.some((sample) => isNum(pick(sample)));
}
