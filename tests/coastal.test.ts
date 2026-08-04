import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COASTLINE, FISHING_AREAS, MAX_COAST_DISTANCE_KM } from '../src/config/coastline';
import { DEFAULT_SPOT } from '../src/config/spots';
import { checkCoastal } from '../src/scoring/coastalCheck';
import { distanceToSegmentKm, haversineKm, nearestPolyline } from '../src/utils/geo';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

/**
 * Real towns, checked against the shipped coastline.
 *
 * This is the test that matters: the whole point of the filter is that someone
 * searching an inland city is never offered a surfcasting spot, and that no
 * genuine coastal town is lost.
 */
type AreaId = keyof typeof FISHING_AREAS;

/**
 * Expected area, or several when the town genuinely straddles a boundary.
 * Calais sits in the Dover Strait, which is exactly where ICES 4.c meets 7.d.
 */
const COASTAL_TOWNS: Array<[string, number, number, AreaId | AreaId[]]> = [
  ['Dunkerque', 51.03, 2.38, 'north-sea'],
  ['Calais', 50.95, 1.86, ['north-sea', 'channel-east']],
  ['Boulogne-sur-Mer', 50.73, 1.61, 'channel-east'],
  ['Berck', 50.4, 1.57, 'channel-east'],
  ['Le Tréport', 50.06, 1.37, 'channel-east'],
  ['Dieppe', 49.92, 1.08, 'channel-east'],
  ['Fécamp', 49.76, 0.37, 'channel-east'],
  ['Le Havre', 49.49, 0.11, 'channel-east'],
  ['Ouistreham', 49.28, -0.25, 'channel-east'],
  ['Cherbourg', 49.64, -1.62, 'channel-west'],
  ['Granville', 48.84, -1.6, 'channel-west'],
  ['Saint-Malo', 48.65, -2.02, 'channel-west'],
  ['Saint-Brieuc', 48.51, -2.77, 'channel-west'],
  ['Roscoff', 48.72, -3.98, 'channel-west'],
  ['Brest', 48.39, -4.49, 'channel-west'],
  // Quimper is on the Odet, opening into the south-Finistère bay: Biscay.
  ['Quimper', 47.99, -4.1, 'biscay-north'],
  ['Lorient', 47.75, -3.37, 'biscay-north'],
  ['Quiberon', 47.48, -3.12, 'biscay-north'],
  ['Saint-Nazaire', 47.27, -2.21, 'biscay-north'],
  ['Les Sables-d’Olonne', 46.5, -1.78, 'biscay-north'],
  ['La Rochelle', 46.16, -1.15, 'biscay-north'],
  ['Royan', 45.63, -1.03, 'biscay-north'],
  ['Lacanau', 45.0, -1.2, 'biscay-south'],
  ['Arcachon', 44.66, -1.17, 'biscay-south'],
  ['Mimizan', 44.2, -1.23, 'biscay-south'],
  ['Biarritz', 43.48, -1.56, 'biscay-south'],
  ['Hendaye', 43.37, -1.78, 'biscay-south'],
  ['Perpignan', 42.7, 2.9, 'gulf-of-lion'],
  ['Sète', 43.4, 3.69, 'gulf-of-lion'],
  ['Marseille', 43.3, 5.37, 'gulf-of-lion'],
  ['Toulon', 43.12, 5.93, 'gulf-of-lion'],
  ['Nice', 43.7, 7.27, 'gulf-of-lion'],
  ['Ajaccio', 41.92, 8.74, 'corsica'],
  ['Bastia', 42.7, 9.45, 'corsica'],
];

/** Cities with no shore to cast from. */
const INLAND_CITIES: Array<[string, number, number]> = [
  ['Lyon', 45.76, 4.83],
  ['Clermont-Ferrand', 45.78, 3.08],
  ['Toulouse', 43.6, 1.44],
  ['Paris', 48.86, 2.35],
  ['Bordeaux', 44.84, -0.58],
  ['Nantes', 47.22, -1.55],
  ['Rouen', 49.44, 1.1],
  ['Lille', 50.63, 3.06],
  ['Strasbourg', 48.57, 7.75],
  ['Dijon', 47.32, 5.04],
  ['Limoges', 45.83, 1.26],
  ['Grenoble', 45.19, 5.72],
  ['Reims', 49.26, 4.03],
  ['Tours', 47.39, 0.69],
  ['Angers', 47.47, -0.55],
  ['Amiens', 49.89, 2.3],
  ['Avignon', 43.95, 4.81],
  ['Nîmes', 43.84, 4.36],
  ['Rennes', 48.11, -1.68],
  ['Poitiers', 46.58, 0.34],
  ['Pau', 43.3, -0.37],
  ['Orléans', 47.9, 1.9],
];

describe('coastal filter', () => {
  it('accepts every coastal town', () => {
    for (const [name, lat, lon] of COASTAL_TOWNS) {
      const check = checkCoastal(at(lat, lon));
      assert.ok(check.fishable, `${name} was rejected at ${check.distanceKm.toFixed(1)} km`);
      assert.ok(check.area, `${name} has no fishing area`);
    }
  });

  it('rejects every inland city', () => {
    for (const [name, lat, lon] of INLAND_CITIES) {
      const check = checkCoastal(at(lat, lon));
      assert.equal(check.fishable, false, `${name} was accepted at ${check.distanceKm.toFixed(1)} km`);
      assert.equal(check.area, null);
    }
  });

  /**
   * Estuary cities are the interesting case: they are on tidal water, but you
   * cannot surfcast there, and the coastline is traced across the river mouth
   * so they measure far from it.
   */
  it('rejects estuary cities well upriver', () => {
    for (const [name, lat, lon] of [
      ['Bordeaux', 44.84, -0.58],
      ['Nantes', 47.22, -1.55],
      ['Rouen', 49.44, 1.1],
    ] as Array<[string, number, number]>) {
      const check = checkCoastal(at(lat, lon));
      assert.equal(check.fishable, false, `${name} at ${check.distanceKm.toFixed(1)} km`);
      assert.ok(check.distanceKm > 30, `${name} is only ${check.distanceKm.toFixed(1)} km out`);
    }
  });

  it('puts each town in the right sea', () => {
    for (const [name, lat, lon, expected] of COASTAL_TOWNS) {
      const check = checkCoastal(at(lat, lon));
      const accepted = Array.isArray(expected) ? expected : [expected];
      assert.ok(
        check.area && accepted.includes(check.area.id as AreaId),
        `${name} was placed in ${check.area?.id}, expected ${accepted.join(' or ')}`
      );
    }
  });

  it('reports a plausible distance for a seafront town', () => {
    // Dunkerque's centre is a couple of kilometres from the beach.
    const check = checkCoastal(DEFAULT_SPOT);
    assert.ok(check.distanceKm < 5, `${check.distanceKm.toFixed(1)} km`);
    assert.equal(check.area?.id, 'north-sea');
  });
});

describe('fishing areas', () => {
  it('names an ICES division or GFCM sub-area for every stretch of coast', () => {
    for (const segment of COASTLINE) {
      const area = FISHING_AREAS[segment.area];
      assert.ok(area, `${segment.area} has no definition`);
      assert.match(area.code, /^(CIEM|CGPM)\s/, `${area.code} is not a recognised area code`);
      assert.ok(area.label.length > 0);
    }
  });

  it('covers every declared area with at least one stretch of coast', () => {
    const traced = new Set(COASTLINE.map((segment) => segment.area));
    for (const id of Object.keys(FISHING_AREAS)) {
      assert.ok(traced.has(id as never), `${id} is declared but never traced`);
    }
  });

  it('marks the Mediterranean as non-tidal', () => {
    // A few tens of centimetres of range: the tide-driven factors barely move.
    assert.equal(FISHING_AREAS['gulf-of-lion'].tidal, false);
    assert.equal(FISHING_AREAS.corsica.tidal, false);
    assert.equal(FISHING_AREAS['north-sea'].tidal, true);
    assert.equal(FISHING_AREAS['biscay-south'].tidal, true);
  });

  it('traces a continuous coastline within each stretch', () => {
    for (const segment of COASTLINE) {
      assert.ok(segment.points.length >= 2, `${segment.area} is not a line`);
      for (let i = 1; i < segment.points.length; i += 1) {
        const [aLat, aLon] = segment.points[i - 1];
        const [bLat, bLon] = segment.points[i];
        const step = haversineKm(at(aLat, aLon), at(bLat, bLon));
        // A gap larger than this would let a town slip through between vertices.
        assert.ok(step < 45, `${segment.area} jumps ${step.toFixed(0)} km at vertex ${i}`);
      }
    }
  });

  it('stays inside metropolitan France', () => {
    for (const segment of COASTLINE) {
      for (const [lat, lon] of segment.points) {
        assert.ok(lat > 41 && lat < 51.5, `latitude ${lat} is outside France`);
        assert.ok(lon > -5.5 && lon < 9.7, `longitude ${lon} is outside France`);
      }
    }
  });
});

describe('geo helpers', () => {
  it('measures a known distance', () => {
    // Dunkerque to Calais is about 30 km.
    const km = haversineKm(at(51.03, 2.38), at(50.95, 1.86));
    assert.ok(Math.abs(km - 37) < 5, `${km.toFixed(1)} km`);
  });

  it('is zero for the same point', () => {
    assert.equal(haversineKm(at(48.5, -2), at(48.5, -2)), 0);
  });

  it('clamps to the ends of a segment', () => {
    const start = at(48, -2);
    const end = at(48, -1);
    // Beyond the far end: distance is measured to the end, not to the line.
    const beyond = distanceToSegmentKm(at(48, 0), start, end);
    assert.ok(Math.abs(beyond - haversineKm(at(48, 0), end)) < 1);

    // On the segment.
    assert.ok(distanceToSegmentKm(at(48, -1.5), start, end) < 0.5);
  });

  it('handles a degenerate segment', () => {
    const point = at(48, -2);
    assert.equal(distanceToSegmentKm(point, at(49, -2), at(49, -2)), haversineKm(point, at(49, -2)));
  });

  it('returns null for no polylines', () => {
    assert.equal(nearestPolyline(at(48, -2), []), null);
  });
});

describe('threshold', () => {
  it('is set for driving to the beach, not for standing on it', () => {
    assert.ok(MAX_COAST_DISTANCE_KM >= 10 && MAX_COAST_DISTANCE_KM <= 30);
  });
});
