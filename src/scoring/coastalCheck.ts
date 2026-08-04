import type { Spot } from '../types';
import {
  COASTLINE,
  FISHING_AREAS,
  MAX_COAST_DISTANCE_KM,
  type FishingArea,
} from '../config/coastline';
import { nearestPolyline, type LatLon } from '../utils/geo';

export interface CoastalCheck {
  /** True when the place is close enough to the sea to surfcast from. */
  fishable: boolean;
  /** Distance to the nearest coast, in km. */
  distanceKm: number;
  /** The sea it sits on, and its stock assessment area. Null when inland. */
  area: FishingArea | null;
}

/**
 * Is this place somewhere you could surfcast for bass?
 *
 * Runs on device against the shipped coastline, so an inland town is rejected
 * before any network call — the user never sees Lyon offered as a fishing spot,
 * and never waits on a request that was doomed.
 *
 * This answers "is it on the coast", not "do we have marine data there". The
 * second question is only answerable by the marine model, and is checked when
 * the forecast loads.
 */
export function checkCoastal(place: LatLon): CoastalCheck {
  const hit = nearestPolyline(
    place,
    COASTLINE.map((segment) => segment.points)
  );

  if (!hit) return { fishable: false, distanceKm: Infinity, area: null };

  const fishable = hit.distanceKm <= MAX_COAST_DISTANCE_KM;
  return {
    fishable,
    distanceKm: hit.distanceKm,
    area: fishable ? FISHING_AREAS[COASTLINE[hit.polylineIndex].area] : null,
  };
}

/** Convenience for a `Spot`, which carries its coordinates in the same shape. */
export function checkSpot(spot: Spot): CoastalCheck {
  return checkCoastal(spot);
}
