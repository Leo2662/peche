import type { Spot } from '../types';

/**
 * MVP ships with a single hardcoded spot, but the app already threads a `Spot`
 * through every layer so adding a picker later is a UI change only.
 */
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
};

export const SPOTS: Spot[] = [DUNKERQUE_DIGUE_DU_BREAK];

export const DEFAULT_SPOT = DUNKERQUE_DIGUE_DU_BREAK;
