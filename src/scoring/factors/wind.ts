import type { FactorResult, ScoreInputs } from '../../types';
import { clamp, isNum } from '../../utils/math';
import { NEUTRAL_FACTOR_VALUE, WEIGHTS } from '../weights';

/**
 * Wind (15 %) — WindScore = 0.6·Direction + 0.4·Speed
 *
 * Direction scores are specific to Dunkerque's north-facing coastline: onshore
 * westerlies stir the sand and push bait against the Digue du Break, while an
 * easterly blows offshore and flattens/clears the water.
 *
 * The spec fixes W/NW/SW = 1, N = 0.8, S = 0.6, E = 0.3; NE and SE sit between
 * their neighbours.
 */
const DIRECTION_SECTORS: Array<{ centre: number; score: number; name: string }> = [
  { centre: 0, score: 0.8, name: 'N' },
  { centre: 45, score: 0.5, name: 'NE' },
  { centre: 90, score: 0.3, name: 'E' },
  { centre: 135, score: 0.45, name: 'SE' },
  { centre: 180, score: 0.6, name: 'S' },
  { centre: 225, score: 1, name: 'SW' },
  { centre: 270, score: 1, name: 'W' },
  { centre: 315, score: 1, name: 'NW' },
];

/** Nearest 45° sector to the bearing the wind blows *from*. */
export function windSector(direction: number): { score: number; name: string } {
  const normalised = ((direction % 360) + 360) % 360;
  const index = Math.round(normalised / 45) % DIRECTION_SECTORS.length;
  const sector = DIRECTION_SECTORS[index];
  return { score: sector.score, name: sector.name };
}

export function windDirectionScore(direction: number): number {
  return windSector(direction).score;
}

/** Speed bands (spec), km/h. A dead calm is as unhelpful as a gale. */
export function windSpeedScore(speed: number): number {
  if (speed > 40) return 0.2;
  if (speed >= 30) return 0.6;
  if (speed >= 15) return 1;
  if (speed >= 10) return 0.8;
  return 0.5;
}

/**
 * Gusts are not part of the published formula but are fetched, and a 25 km/h
 * mean with 70 km/h gusts is not fishable from a dyke. Above the threshold the
 * speed component is damped; below it nothing changes.
 */
export const GUST_PENALTY_THRESHOLD = 50;
export const GUST_PENALTY_FACTOR = 0.7;

export function windFactor(inputs: ScoreInputs): FactorResult {
  const { windSpeed, windDirection, windGusts } = inputs;

  const hasSpeed = isNum(windSpeed);
  const hasDirection = isNum(windDirection);

  if (!hasSpeed && !hasDirection) {
    return {
      key: 'wind',
      value: NEUTRAL_FACTOR_VALUE,
      weight: WEIGHTS.wind,
      detail: { windSpeed: null, windDirection: null, directionScore: null, speedScore: null },
      estimated: true,
    };
  }

  const sector = hasDirection ? windSector(windDirection) : null;
  const directionSub = sector ? sector.score : null;

  let speedSub = hasSpeed ? windSpeedScore(windSpeed) : null;
  const gusty = isNum(windGusts) && windGusts > GUST_PENALTY_THRESHOLD;
  if (speedSub !== null && gusty) speedSub *= GUST_PENALTY_FACTOR;

  const parts: Array<{ value: number | null; weight: number }> = [
    { value: directionSub, weight: 0.6 },
    { value: speedSub, weight: 0.4 },
  ];
  const available = parts.filter((part) => part.value !== null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);

  const value = clamp(
    available.reduce((sum, part) => sum + (part.value as number) * part.weight, 0) / totalWeight
  );

  return {
    key: 'wind',
    value,
    weight: WEIGHTS.wind,
    detail: {
      windSpeed: windSpeed ?? null,
      windDirection: windDirection ?? null,
      windGusts: windGusts ?? null,
      directionScore: directionSub,
      speedScore: speedSub,
      gustPenaltyApplied: gusty ? 1 : 0,
    },
    estimated: available.length < parts.length,
  };
}
