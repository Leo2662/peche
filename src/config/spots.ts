import type { Spot, WindSectorScores } from '../types';

/**
 * Wind preference at Dunkerque, by 45° sector from N clockwise.
 *
 * Westerlies push bait and coloured water against the Digue du Break; an
 * easterly blows offshore and flattens it. W/NW/SW = 1, N = 0.8, S = 0.6,
 * E = 0.3 come from the spec; NE and SE sit between their neighbours.
 *
 * These numbers describe one shoreline. They are not transferable — which is
 * why a searched spot gets none, and is scored on wind strength alone.
 */
const DUNKERQUE_WIND_SECTORS: WindSectorScores = [0.8, 0.5, 0.3, 0.45, 0.6, 1, 1, 1];

/** The spot the app ships with, and the only one it is calibrated for. */
export const DUNKERQUE_DIGUE_DU_BREAK: Spot = {
  id: 'dunkerque-digue-du-break',
  name: 'Dunkerque – Digue du Break',
  label: 'Dunkerque · Digue du Break',
  latitude: 51.05,
  longitude: 2.3,
  timezone: 'Europe/Paris',
  // SHOM "unité de hauteur" for Dunkerque ≈ 2.75 m (half the mean spring range).
  tidalUnitHeight: 2.75,
  meanSpringRange: 5.5,
  windSectors: DUNKERQUE_WIND_SECTORS,
  // Southern North Sea — the northern sea bass stock.
  areaId: 'north-sea',
};

export const SPOTS: Spot[] = [DUNKERQUE_DIGUE_DU_BREAK];

export const DEFAULT_SPOT = DUNKERQUE_DIGUE_DU_BREAK;

/**
 * True when the spot carries locally measured constants rather than values
 * estimated from the forecast. Drives the "estimated" hint in the UI.
 */
export function isCalibrated(spot: Spot): boolean {
  return spot.windSectors !== undefined && spot.tidalUnitHeight !== undefined;
}
