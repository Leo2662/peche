import type { Spot, WindSectorScores } from '../types';

/**
 * Wind preference at Dunkerque, by 45° sector from N clockwise.
 *
 * Westerlies push bait and coloured water against the Digue du Braek; an
 * easterly blows offshore and flattens it. W/NW/SW = 1, N = 0.8, S = 0.6,
 * E = 0.3 come from the spec; NE and SE sit between their neighbours.
 *
 * These numbers describe one shoreline. They are not transferable — which is
 * why a searched spot gets none, and is scored on wind strength alone.
 *
 * Published as a table on /peche-bar-dunkerque/, which a test pins to this
 * array — change a sector here and the page has to change with it.
 */
const DUNKERQUE_WIND_SECTORS: WindSectorScores = [0.8, 0.5, 0.3, 0.45, 0.6, 1, 1, 1];

/** The spot the app ships with, and the only one it is calibrated for. */
export const DUNKERQUE_DIGUE_DU_BRAEK: Spot = {
  // Spelt "break" because this is a storage key, not a name: it keys the
  // forecast cache and rides along inside the saved spot. The dyke is the
  // Braek — the display strings below were corrected, the key was not, so
  // nobody's cache or saved spot is orphaned by a spelling fix.
  id: 'dunkerque-digue-du-break',
  name: 'Dunkerque – Digue du Braek',
  label: 'Dunkerque · Digue du Braek',
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

export const SPOTS: Spot[] = [DUNKERQUE_DIGUE_DU_BRAEK];

export const DEFAULT_SPOT = DUNKERQUE_DIGUE_DU_BRAEK;

/**
 * True when the spot carries locally measured constants rather than values
 * estimated from the forecast. Drives the "estimated" hint in the UI.
 */
export function isCalibrated(spot: Spot): boolean {
  return spot.windSectors !== undefined && spot.tidalUnitHeight !== undefined;
}
