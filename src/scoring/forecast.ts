import type { Forecast } from '../types';
import { TIMELINE_STEP_MINUTES, WINDOW_SEARCH_HOURS } from '../config/env';
import { nextEvent } from '../api/tides/tideMath';
import { getMoonInfo } from '../utils/moon';
import { HOUR, MINUTE } from '../utils/time';
import { buildInputs, type RawConditions } from './buildInputs';
import { computeScore } from './computeScore';
import { findBestWindow, type TimelinePoint } from './bestWindow';

/**
 * Turn raw provider data into everything the screen renders: the score right
 * now, the best window ahead, and the timeline both were derived from.
 */
export function buildForecast(raw: RawConditions, now: number): Forecast {
  const step = TIMELINE_STEP_MINUTES * MINUTE;
  const horizon = now + WINDOW_SEARCH_HOURS * HOUR;

  const timeline: TimelinePoint[] = [];
  for (let time = now; time <= horizon; time += step) {
    timeline.push({ time, score: computeScore(buildInputs(raw, time)).score });
  }

  return {
    spot: raw.spot,
    generatedAt: now,
    now: computeScore(buildInputs(raw, now)),
    bestWindow: findBestWindow(timeline),
    moon: getMoonInfo(now),
    tide: {
      coefficient: raw.tide.coefficient,
      range: raw.tide.range,
      nextHigh: nextEvent(raw.tide.events, now, 'high'),
      nextLow: nextEvent(raw.tide.events, now, 'low'),
      source: raw.tide.source,
    },
    timeline,
  };
}
