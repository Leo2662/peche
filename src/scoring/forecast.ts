import type { DayForecast, FactorKey, FactorSeries, Forecast } from '../types';
import { FACTOR_ORDER } from './weights';
import { FORECAST_DAYS, MAX_WINDOWS_PER_DAY, TIMELINE_STEP_MINUTES } from '../config/env';
import { nextEvent } from '../api/tides/tideMath';
import { getMoonInfo } from '../utils/moon';
import { DAY, MINUTE, zonedDayKey } from '../utils/time';
import { buildInputs, type RawConditions } from './buildInputs';
import { computeScore } from './computeScore';
import { findWindows, type TimelinePoint } from './bestWindow';

/**
 * Turn raw provider data into everything the screen renders: the score right
 * now, and one entry per selectable day with the windows worth fishing in it.
 */
export function buildForecast(raw: RawConditions, now: number): Forecast {
  const step = TIMELINE_STEP_MINUTES * MINUTE;
  const horizon = now + FORECAST_DAYS * DAY;

  // The full breakdown is kept while the windows are found — that is what the
  // "why?" sheet explains — but only {time, score} is carried on the Forecast,
  // so the cached payload stays small.
  const detailed: TimelinePoint[] = [];
  for (let time = now; time <= horizon; time += step) {
    const result = computeScore(buildInputs(raw, time));
    detailed.push({ time, score: result.score, result });
  }

  return {
    spot: raw.spot,
    generatedAt: now,
    now: computeScore(buildInputs(raw, now)),
    days: groupIntoDays(detailed, raw.spot.timezone, now),
    moon: getMoonInfo(now),
    tide: {
      coefficient: raw.tide.coefficient,
      range: raw.tide.range,
      nextHigh: nextEvent(raw.tide.events, now, 'high'),
      nextLow: nextEvent(raw.tide.events, now, 'low'),
      source: raw.tide.source,
    },
    timeline: detailed.map(({ time, score }) => ({ time, score })),
  };
}

/**
 * Split the timeline into calendar days *in the spot's timezone* and find the
 * windows inside each.
 *
 * Windows are searched per day rather than globally, so a mediocre Tuesday
 * still surfaces its own best couple of hours instead of being crowded out by
 * a brilliant Friday.
 */
export function groupIntoDays(
  timeline: TimelinePoint[],
  timeZone: string,
  now: number,
  maxDays = FORECAST_DAYS
): DayForecast[] {
  if (timeline.length === 0) return [];

  const buckets = new Map<string, TimelinePoint[]>();
  for (const point of timeline) {
    const key = zonedDayKey(point.time, timeZone);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }

  const todayKey = zonedDayKey(now, timeZone);

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    // The timeline starts at "now", so it spills a few hours into one day past
    // the range the marine model actually covers. Drop that stub.
    .slice(0, maxDays)
    .map(([key, points]) => {
      const windows = findWindows(points, MAX_WINDOWS_PER_DAY).sort((a, b) => a.start - b.start);

      return {
        key,
        start: points[0].time,
        end: points[points.length - 1].time,
        peakScore: points.reduce((max, point) => Math.max(max, point.score), 0),
        windows,
        series: buildFactorSeries(points),
        // The first day starts at "now", so its earlier hours are missing; the
        // last may be cut short by the end of the forecast horizon.
        complete: key !== todayKey && points.length >= (DAY / MINUTE / TIMELINE_STEP_MINUTES) * 0.95,
      };
    });
}

/**
 * Downsample a day's factor values to one sample per hour.
 *
 * The sparkline behind a reason only needs the shape of the curve, and hourly
 * is already finer than the source data — the APIs publish hourly, everything
 * between is interpolation.
 */
export function buildFactorSeries(points: TimelinePoint[]): FactorSeries {
  const stride = Math.max(1, Math.round(60 / TIMELINE_STEP_MINUTES));

  const values = {} as Record<FactorKey, number[]>;
  for (const key of FACTOR_ORDER) values[key] = [];

  for (let i = 0; i < points.length; i += stride) {
    const result = points[i].result;
    for (const key of FACTOR_ORDER) {
      values[key].push(result ? Number(result.factors[key].value.toFixed(2)) : 0);
    }
  }

  return { start: points[0].time, step: stride * TIMELINE_STEP_MINUTES * MINUTE, values };
}
