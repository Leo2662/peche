import type { BestWindow } from '../types';
import { HOUR, MINUTE } from '../utils/time';

export interface TimelinePoint {
  time: number;
  score: number;
}

/** Scores within this many points of the peak still count as "the window". */
export const WINDOW_TOLERANCE = 5;

/** Below this, there is no window worth naming. */
export const WINDOW_MIN_SCORE = 45;

/** Never report a window shorter than this — a spike is not a session. */
export const MIN_WINDOW_MS = 45 * MINUTE;

/**
 * Never report one longer than this either. On a settled day the tide plateau
 * alone can stay flat for six hours, and "go fishing sometime this afternoon"
 * is not an answer; the angler wants the best few hours in it.
 */
export const MAX_WINDOW_MS = 3 * HOUR;

/**
 * Find the best contiguous fishing window in a score timeline.
 *
 * Take the peak, grow outwards while the score stays within
 * `WINDOW_TOLERANCE` of it — this follows the natural plateau around a tide
 * rather than an arbitrary fixed-length slot — then bound the result so it
 * stays actionable.
 */
export function findBestWindow(timeline: TimelinePoint[]): BestWindow | null {
  if (timeline.length === 0) return null;

  let peakIndex = 0;
  for (let i = 1; i < timeline.length; i += 1) {
    if (timeline[i].score > timeline[peakIndex].score) peakIndex = i;
  }

  const peakScore = timeline[peakIndex].score;
  if (peakScore < WINDOW_MIN_SCORE) return null;

  const floor = Math.max(peakScore - WINDOW_TOLERANCE, WINDOW_MIN_SCORE);

  let start = peakIndex;
  while (start > 0 && timeline[start - 1].score >= floor) start -= 1;

  let end = peakIndex;
  while (end < timeline.length - 1 && timeline[end + 1].score >= floor) end += 1;

  [start, end] = trimToMaxDuration(timeline, start, end);

  let window: BestWindow = {
    start: timeline[start].time,
    end: timeline[end].time,
    peakScore,
  };

  if (window.end - window.start < MIN_WINDOW_MS) {
    window = padToMinimum(window);
  }

  return window;
}

/**
 * Slide a `MAX_WINDOW_MS` window across the plateau and keep the stretch with
 * the highest total score, so trimming picks the best hours rather than simply
 * chopping off the tail.
 */
function trimToMaxDuration(
  timeline: TimelinePoint[],
  start: number,
  end: number
): [number, number] {
  if (timeline[end].time - timeline[start].time <= MAX_WINDOW_MS) return [start, end];

  let bestStart = start;
  let bestEnd = end;
  let bestTotal = -Infinity;

  for (let i = start; i <= end; i += 1) {
    let j = i;
    let total = 0;
    while (j <= end && timeline[j].time - timeline[i].time <= MAX_WINDOW_MS) {
      total += timeline[j].score;
      j += 1;
    }
    if (total > bestTotal) {
      bestTotal = total;
      bestStart = i;
      bestEnd = j - 1;
    }
  }

  return [bestStart, bestEnd];
}

function padToMinimum(window: BestWindow): BestWindow {
  const centre = (window.start + window.end) / 2;
  return {
    ...window,
    start: Math.round(centre - MIN_WINDOW_MS / 2),
    end: Math.round(centre + MIN_WINDOW_MS / 2),
  };
}
