import type { Spot, TideEvent } from '../../types';
import { clamp, isNum, parabolicVertexOffset } from '../../utils/math';
import { HOUR } from '../../utils/time';

export interface HeightPoint {
  time: number;
  height: number;
}

/**
 * Locate high and low waters in a sampled sea-level curve.
 *
 * The curve is hourly, so a raw argmax would quantise every high water to the
 * nearest hour. We refine each extremum with a parabola through its three
 * neighbouring samples, which recovers the true peak to within a few minutes
 * for a near-sinusoidal semi-diurnal tide.
 */
export function findTideExtrema(points: HeightPoint[]): TideEvent[] {
  const usable = points.filter((p) => isNum(p.height)).sort((a, b) => a.time - b.time);
  if (usable.length < 3) return [];

  const events: TideEvent[] = [];

  for (let i = 1; i < usable.length - 1; i += 1) {
    const prev = usable[i - 1];
    const curr = usable[i];
    const next = usable[i + 1];

    const isHigh = curr.height > prev.height && curr.height >= next.height;
    const isLow = curr.height < prev.height && curr.height <= next.height;
    if (!isHigh && !isLow) continue;

    const step = (next.time - prev.time) / 2;
    const offset = parabolicVertexOffset(prev.height, curr.height, next.height);
    // Vertex value of the same parabola, so the reported height is not the
    // (slightly low/high) sampled one.
    const a = (prev.height - 2 * curr.height + next.height) / 2;
    const b = (next.height - prev.height) / 2;
    const refinedHeight = curr.height + (b * offset + a * offset * offset);

    events.push({
      type: isHigh ? 'high' : 'low',
      time: Math.round(curr.time + offset * step),
      height: Number(refinedHeight.toFixed(3)),
    });
  }

  return dedupeAlternating(events);
}

/**
 * A noisy curve can produce two consecutive highs (or lows). Keep the more
 * extreme of each such pair so the sequence strictly alternates.
 */
function dedupeAlternating(events: TideEvent[]): TideEvent[] {
  const result: TideEvent[] = [];

  for (const event of events) {
    const last = result[result.length - 1];
    if (!last || last.type !== event.type) {
      result.push(event);
      continue;
    }
    const keepNew =
      event.type === 'high' ? event.height > last.height : event.height < last.height;
    if (keepNew) result[result.length - 1] = event;
  }

  return result;
}

/** The high/low pair bracketing `time`, used to measure the local tidal range. */
export function tidalRangeAt(events: TideEvent[], time: number): number | null {
  if (events.length < 2) return null;

  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < events.length - 1; i += 1) {
    const a = events[i];
    const b = events[i + 1];
    if (a.type === b.type) continue;
    const midpoint = (a.time + b.time) / 2;
    const distance = Math.abs(midpoint - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Math.abs(a.height - b.height);
    }
  }

  return best;
}

/**
 * French tidal coefficient from a tidal range.
 *
 * By definition `coefficient = 100 × semiRange / U`, where `U` is the harbour's
 * "unité de hauteur" (half the mean spring range). The scale is conventionally
 * bounded to 20–120.
 */
export function coefficientFromRange(range: number, unitHeight: number): number {
  if (unitHeight <= 0) return 20;
  const semiRange = range / 2;
  const coefficient = (100 * semiRange) / unitHeight;
  return Math.round(clamp(coefficient, 20, 120));
}

/**
 * Tidal constants for a spot the app has no calibration for.
 *
 * The largest range in the forecast window is taken as a proxy for the mean
 * spring range. Over 7 days that is a decent estimate near springs and an
 * under-estimate near neaps, so the coefficient it yields is *relative to the
 * week*, not the SHOM scale.
 *
 * Crude, but far better than reusing Dunkerque's 5.5 m: on the Mediterranean,
 * where the range is a few tens of centimetres, the fixed value would peg every
 * tide sub-score to its floor and make the index meaningless.
 */
export function deriveTidalScale(events: TideEvent[]): {
  meanSpringRange: number;
  tidalUnitHeight: number;
} | null {
  let largest = 0;
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].type === events[i + 1].type) continue;
    largest = Math.max(largest, Math.abs(events[i].height - events[i + 1].height));
  }

  if (largest <= 0) return null;
  return { meanSpringRange: largest, tidalUnitHeight: largest / 2 };
}

/**
 * Tidal coefficient for a spot, calibrated where possible and derived from the
 * observed curve where not.
 */
export function coefficientFor(
  spot: Spot,
  events: TideEvent[],
  range: number | null
): number | null {
  if (range === null) return null;
  const unitHeight = spot.tidalUnitHeight ?? deriveTidalScale(events)?.tidalUnitHeight;
  return unitHeight === undefined ? null : coefficientFromRange(range, unitHeight);
}

/** Fill in whatever the spot does not already specify. */
export function withTidalScale(spot: Spot, events: TideEvent[]): Spot {
  if (spot.tidalUnitHeight !== undefined && spot.meanSpringRange !== undefined) return spot;

  const derived = deriveTidalScale(events);
  if (!derived) return spot;

  return {
    ...spot,
    tidalUnitHeight: spot.tidalUnitHeight ?? derived.tidalUnitHeight,
    meanSpringRange: spot.meanSpringRange ?? derived.meanSpringRange,
  };
}

/**
 * Estimate tidal current speed from the rate of change of sea level.
 *
 * For a standing-wave-dominated coast like the southern North Sea the current
 * tracks dH/dt closely enough for a fishing index. `CURRENT_PER_METRE_PER_HOUR`
 * is calibrated so that a spring tide at Dunkerque (≈5.5 m over ~6.2 h, peak
 * dH/dt ≈ 1.4 m/h) yields ≈1.2 m/s — the observed order of magnitude there.
 *
 * Only used when the marine model does not publish `ocean_current_velocity`.
 */
const CURRENT_PER_METRE_PER_HOUR = 0.85;

export function estimateCurrentFromCurve(points: HeightPoint[], time: number): number | null {
  const usable = points.filter((p) => isNum(p.height)).sort((a, b) => a.time - b.time);
  if (usable.length < 2) return null;

  let index = usable.findIndex((p) => p.time > time);
  if (index <= 0) index = index === 0 ? 1 : usable.length - 1;

  const before = usable[index - 1];
  const after = usable[index];
  const dt = (after.time - before.time) / HOUR;
  if (dt <= 0) return null;

  const slope = Math.abs(after.height - before.height) / dt;
  return slope * CURRENT_PER_METRE_PER_HOUR;
}

/**
 * Signed hours from the nearest high tide (negative = before it).
 * Returns null when no high water is known within a tidal cycle of `time`.
 */
export function hoursFromHighTide(events: TideEvent[], time: number): number | null {
  const highs = events.filter((e) => e.type === 'high');
  if (highs.length === 0) return null;

  let nearest = highs[0];
  for (const high of highs) {
    if (Math.abs(high.time - time) < Math.abs(nearest.time - time)) nearest = high;
  }

  const hours = (time - nearest.time) / HOUR;
  // Beyond ±6.5 h we are closer to another cycle than to any known high water.
  return Math.abs(hours) > 6.5 ? null : hours;
}

export function nextEvent(events: TideEvent[], time: number, type: 'high' | 'low'): TideEvent | null {
  return events.find((e) => e.type === type && e.time >= time) ?? null;
}
