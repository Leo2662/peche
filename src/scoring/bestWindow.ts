import type { BestWindow, ScoreResult } from '../types';
import { HOUR, MINUTE } from '../utils/time';
import { explainScore } from './explain';

export interface TimelinePoint {
  time: number;
  score: number;
  /**
   * Full factor breakdown at this instant. Present on the real timeline, and
   * omitted by tests that only care about the shape of the score curve.
   */
  result?: ScoreResult;
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
 * Dead time enforced between two reported windows, so the second one is a
 * genuinely different tide rather than the shoulder of the first.
 */
export const WINDOW_SEPARATION_MS = 90 * MINUTE;

/**
 * A secondary window is only offered if it comes within this many points of the
 * day's best one.
 *
 * Otherwise a day with one outstanding tide also lists the mediocre humps
 * either side of it, and "the best windows" stops meaning anything. Roughly the
 * width of one verdict band.
 */
export const WINDOW_PEAK_DROP_LIMIT = 12;

/**
 * Find the best fishing windows in a score timeline, best-scoring first.
 *
 * Each pass takes the highest remaining peak and grows outwards while the
 * score stays within `WINDOW_TOLERANCE` of it — following the natural plateau
 * around a tide rather than an arbitrary fixed-length slot — then bounds the
 * result so it stays actionable. The whole plateau plus a separation gap is
 * then excluded, so a day with two tides yields two windows rather than two
 * halves of the same one.
 */
export function findWindows(
  timeline: TimelinePoint[],
  maxCount = 3,
  maxDropFromBest = WINDOW_PEAK_DROP_LIMIT
): BestWindow[] {
  if (timeline.length === 0 || maxCount <= 0) return [];

  const consumed = new Array<boolean>(timeline.length).fill(false);
  const windows: BestWindow[] = [];

  for (let pass = 0; pass < maxCount; pass += 1) {
    const peakIndex = findAvailablePeak(timeline, consumed);
    if (peakIndex === -1) break;

    const peakScore = timeline[peakIndex].score;
    if (peakScore < WINDOW_MIN_SCORE) break;

    // Passes run best-first, so windows[0] holds the day's best: once a peak
    // falls too far below it, every later one does too.
    if (windows.length > 0 && windows[0].peakScore - peakScore > maxDropFromBest) break;

    const floor = Math.max(peakScore - WINDOW_TOLERANCE, WINDOW_MIN_SCORE);

    // Grow the full plateau…
    let plateauStart = peakIndex;
    while (
      plateauStart > 0 &&
      !consumed[plateauStart - 1] &&
      timeline[plateauStart - 1].score >= floor
    ) {
      plateauStart -= 1;
    }

    let plateauEnd = peakIndex;
    while (
      plateauEnd < timeline.length - 1 &&
      !consumed[plateauEnd + 1] &&
      timeline[plateauEnd + 1].score >= floor
    ) {
      plateauEnd += 1;
    }

    // …report only the best stretch of it…
    const [start, end] = trimToMaxDuration(timeline, plateauStart, plateauEnd);

    const peak = timeline[peakIndex];
    let window: BestWindow = {
      start: timeline[start].time,
      end: timeline[end].time,
      peakScore,
      peakTime: peak.time,
      reasons: peak.result ? explainScore(peak.result) : [],
      peak: peak.result,
    };
    if (window.end - window.start < MIN_WINDOW_MS) window = padToMinimum(window);
    windows.push(window);

    // …but consume the whole plateau plus a gap, so the next pass finds a
    // different tide and not the shoulder we just trimmed off.
    consume(timeline, consumed, plateauStart, plateauEnd);
  }

  return windows;
}

/** The single best window, or null. Convenience wrapper over `findWindows`. */
export function findBestWindow(timeline: TimelinePoint[]): BestWindow | null {
  return findWindows(timeline, 1)[0] ?? null;
}

function findAvailablePeak(timeline: TimelinePoint[], consumed: boolean[]): number {
  let peakIndex = -1;
  for (let i = 0; i < timeline.length; i += 1) {
    if (consumed[i]) continue;
    if (peakIndex === -1 || timeline[i].score > timeline[peakIndex].score) peakIndex = i;
  }
  return peakIndex;
}

function consume(
  timeline: TimelinePoint[],
  consumed: boolean[],
  start: number,
  end: number
): void {
  const from = timeline[start].time - WINDOW_SEPARATION_MS;
  const to = timeline[end].time + WINDOW_SEPARATION_MS;
  for (let i = 0; i < timeline.length; i += 1) {
    if (timeline[i].time >= from && timeline[i].time <= to) consumed[i] = true;
  }
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
