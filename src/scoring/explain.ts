import type { FactorResult, Reason, ReasonKind, ScoreResult } from '../types';
import { isNum } from '../utils/math';

/**
 * Turn a score into the handful of conditions that actually earned it.
 *
 * The rule: a reason must be *favourable* (the factor is genuinely good, not
 * merely present) and it must *matter* (weight × value). Sorting by that
 * product is why biological activity at 0.9 outranks pressure at 1.0 — the
 * first is worth 31 points, the second 5.
 *
 * Returns identifiers, never words. See `STRINGS.reasons` for the copy.
 */

/** Below this a factor is not a reason to go — it is just not an obstacle. */
export const REASON_THRESHOLD = 0.7;

/** More than this and the answer stops being readable at a glance. */
export const MAX_REASONS = 4;

/** Shown when nothing clears the threshold, so the sheet is never empty. */
const FALLBACK_REASONS = 2;

export function explainScore(result: ScoreResult): Reason[] {
  const candidates: Reason[] = [];

  for (const factor of Object.values(result.factors)) {
    const kind = describeFactor(factor);
    if (kind) candidates.push({ key: factor.key, kind, value: factor.value });
  }

  // Strongest contribution first: weight × value, not value alone.
  const weightOf = (reason: Reason) => result.factors[reason.key].weight;
  candidates.sort((a, b) => b.value * weightOf(b) - a.value * weightOf(a));

  const strong = candidates.filter((reason) => reason.value >= REASON_THRESHOLD);
  if (strong.length > 0) return strong.slice(0, MAX_REASONS);

  // A mediocre window is still the best one available; say what carried it
  // rather than showing nothing at all.
  return candidates.slice(0, FALLBACK_REASONS);
}

/** The single most telling thing about one factor, or null if it has nothing to say. */
function describeFactor(factor: FactorResult): ReasonKind | null {
  const d = factor.detail;

  switch (factor.key) {
    case 'tideWindow': {
      const hours = d.hoursFromHighTide;
      if (!isNum(hours)) return null;
      if (Math.abs(hours) <= 0.5) return 'slackHigh';
      return hours < 0 ? 'flood' : 'ebb';
    }

    case 'biologicalActivity': {
      // Whichever sub-score is carrying the factor.
      const current = d.currentScore;
      const coefficient = d.tideCoefficient;
      if (isNum(current) && current >= 1) return 'current';
      if (isNum(coefficient) && coefficient >= 80) return 'springTide';
      if (isNum(d.tidalRangeScore) && d.tidalRangeScore >= 0.7) return 'tidalRange';
      if (isNum(current) && current >= 0.6) return 'current';
      return null;
    }

    case 'wind': {
      const direction = d.windDirection;
      const directionScore = d.directionScore;
      if (isNum(direction) && isNum(directionScore) && directionScore >= 0.8) {
        return sectorKind(direction);
      }
      // Direction is unremarkable — the strength is what helps.
      if (isNum(d.speedScore) && d.speedScore >= 0.8) return 'breeze';
      return null;
    }

    case 'waves':
      return factor.value >= 0.8 ? 'swell' : null;

    case 'light': {
      if (isNum(d.twilightScore) && d.twilightScore >= 1) {
        // Within an hour of one of them — which?
        return d.hoursToTwilight !== null && isDawn(d) ? 'dawn' : 'dusk';
      }
      if (isNum(d.twilightScore) && d.twilightScore >= 0.6) return 'night';
      if (isNum(d.cloudScore) && d.cloudScore >= 0.8) return 'overcast';
      return null;
    }

    case 'waterTemperature':
      return factor.value >= 0.8 ? 'waterTemperature' : null;

    case 'pressure':
      return factor.value >= 1 ? 'stablePressure' : null;

    default:
      return null;
  }
}

/**
 * The light factor knows how far we are from the nearer of sunrise and sunset,
 * but not which. `dawnSide` is set by the factor for exactly this.
 */
function isDawn(detail: Record<string, number | null>): boolean {
  return detail.dawnSide === 1;
}

/** Wind bearing → the sector words worth printing. */
function sectorKind(direction: number): ReasonKind {
  const normalised = ((direction % 360) + 360) % 360;
  const index = Math.round(normalised / 45) % 8;
  switch (index) {
    case 0:
      return 'windN';
    case 5:
      return 'windSW';
    case 6:
      return 'windW';
    case 7:
      return 'windNW';
    default:
      // Sectors that never clear the 0.8 direction gate at this spot.
      return 'breeze';
  }
}
