/** Great-circle geometry, in kilometres. */

const EARTH_RADIUS_KM = 6371;

export interface LatLon {
  latitude: number;
  longitude: number;
}

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from a point to a segment, in km.
 *
 * Over a few tens of kilometres at French latitudes the error from treating the
 * sphere as flat is centimetres, so the segment maths is done in a local
 * equirectangular projection — far cheaper than a spherical cross-track, and
 * well inside the tolerance this is used with.
 */
export function distanceToSegmentKm(point: LatLon, start: LatLon, end: LatLon): number {
  // Project to kilometres around the point's latitude.
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(toRad(point.latitude));

  const px = (point.longitude - start.longitude) * kmPerDegLon;
  const py = (point.latitude - start.latitude) * kmPerDegLat;
  const sx = (end.longitude - start.longitude) * kmPerDegLon;
  const sy = (end.latitude - start.latitude) * kmPerDegLat;

  const lengthSq = sx * sx + sy * sy;
  if (lengthSq === 0) return haversineKm(point, start);

  // Clamped projection of the point onto the segment.
  const t = Math.max(0, Math.min(1, (px * sx + py * sy) / lengthSq));
  const dx = px - t * sx;
  const dy = py - t * sy;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface PolylineHit {
  /** Distance from the point to the nearest segment, in km. */
  distanceKm: number;
  /** Index of the polyline the nearest segment belongs to. */
  polylineIndex: number;
}

/** Nearest of several polylines to a point. */
export function nearestPolyline(
  point: LatLon,
  polylines: Array<ReadonlyArray<readonly [number, number]>>
): PolylineHit | null {
  let best: PolylineHit | null = null;

  polylines.forEach((points, polylineIndex) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = { latitude: points[i][0], longitude: points[i][1] };
      const end = { latitude: points[i + 1][0], longitude: points[i + 1][1] };
      const distanceKm = distanceToSegmentKm(point, start, end);
      if (!best || distanceKm < best.distanceKm) best = { distanceKm, polylineIndex };
    }
  });

  return best;
}
