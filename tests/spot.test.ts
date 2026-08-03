import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SPOT, isCalibrated } from '../src/config/spots';
import {
  coefficientFor,
  coefficientFromRange,
  deriveTidalScale,
  findTideExtrema,
  withTidalScale,
  type HeightPoint,
} from '../src/api/tides/tideMath';
import { biologicalActivityFactor } from '../src/scoring/factors/biologicalActivity';
import { windDirectionScore, windFactor, windSectorIndex } from '../src/scoring/factors/wind';
import { computeScore } from '../src/scoring/computeScore';
import type { ScoreInputs, Spot } from '../src/types';
import { HOUR } from '../src/utils/time';

const NOW = Date.UTC(2026, 6, 30, 19, 0);
const TIDAL_PERIOD = 12.42 * HOUR;

/** A place found through search: coordinates and a timezone, nothing else. */
const SEARCHED: Spot = {
  id: 'geo:2995469',
  name: 'Marseille',
  label: 'Marseille',
  latitude: 43.29695,
  longitude: 5.38107,
  timezone: 'Europe/Paris',
};

function curve(range: number, hours = 7 * 24): HeightPoint[] {
  const points: HeightPoint[] = [];
  for (let i = 0; i < hours; i += 1) {
    const time = NOW + i * HOUR;
    points.push({ time, height: (range / 2) * Math.cos((2 * Math.PI * time) / TIDAL_PERIOD) });
  }
  return points;
}

const BASE: ScoreInputs = {
  time: NOW,
  spot: DEFAULT_SPOT,
  tideCoefficient: 100,
  currentVelocity: 0.8,
  tidalRange: 5.4,
  hoursFromHighTide: 0,
  windSpeed: 20,
  windDirection: 270,
  windGusts: 28,
  waveHeight: 1,
  wavePeriod: 9,
  cloudCover: 85,
  sun: { sunrise: NOW - 14 * HOUR, sunset: NOW + 0.5 * HOUR },
  seaTemperature: 16,
  pressureTrend6h: 0.4,
};

describe('calibration', () => {
  it('knows Dunkerque is calibrated and a searched place is not', () => {
    assert.equal(isCalibrated(DEFAULT_SPOT), true);
    assert.equal(isCalibrated(SEARCHED), false);
  });
});

describe('wind at an uncalibrated spot', () => {
  it('has no direction preference to apply', () => {
    assert.equal(windDirectionScore(270, SEARCHED.windSectors), null);
    assert.equal(windDirectionScore(270, DEFAULT_SPOT.windSectors), 1);
  });

  it('falls back to strength alone, and says so', () => {
    const searched = windFactor({ ...BASE, spot: SEARCHED });
    // 20 km/h is in the ideal band, so the factor is the speed score.
    assert.equal(searched.value, 1);
    assert.equal(searched.detail.directionScore, null);
    assert.equal(searched.estimated, true);
  });

  it('does not punish an easterly it cannot judge', () => {
    // At Dunkerque an easterly is the worst wind there is. Somewhere the app
    // has never been tuned for, that is an assumption it has no right to make.
    const atDunkerque = windFactor({ ...BASE, windDirection: 90 });
    const elsewhere = windFactor({ ...BASE, spot: SEARCHED, windDirection: 90 });
    assert.ok(elsewhere.value > atDunkerque.value);
  });

  it('still maps bearings to sectors', () => {
    assert.equal(windSectorIndex(0), 0);
    assert.equal(windSectorIndex(270), 6);
    assert.equal(windSectorIndex(-90), 6);
  });
});

describe('tidal scale for an uncalibrated spot', () => {
  it('derives the reference range from the observed curve', () => {
    const events = findTideExtrema(curve(0.35));
    const derived = deriveTidalScale(events);
    assert.ok(derived);
    // Mediterranean-scale tide: tens of centimetres, not Dunkerque's 5.5 m.
    assert.ok(Math.abs(derived.meanSpringRange - 0.35) < 0.05, `${derived.meanSpringRange}`);
    assert.equal(derived.tidalUnitHeight, derived.meanSpringRange / 2);
  });

  it('fills a searched spot in and leaves a calibrated one alone', () => {
    const events = findTideExtrema(curve(0.35));

    const filled = withTidalScale(SEARCHED, events);
    assert.ok(filled.meanSpringRange !== undefined);
    assert.ok(filled.meanSpringRange < 1);

    const untouched = withTidalScale(DEFAULT_SPOT, events);
    assert.equal(untouched.meanSpringRange, 5.5);
    assert.equal(untouched.tidalUnitHeight, 2.75);
  });

  it('leaves the spot as-is when the curve is unusable', () => {
    assert.equal(deriveTidalScale([]), null);
    assert.equal(withTidalScale(SEARCHED, []), SEARCHED);
  });

  /**
   * The point of the whole exercise: with Dunkerque's fixed 5.5 m, a
   * Mediterranean tide would sit at the floor of the range sub-score forever.
   */
  it('rescues the tidal-range sub-score on a microtidal coast', () => {
    const events = findTideExtrema(curve(0.35));
    const rescaled = withTidalScale(SEARCHED, events);

    const withDunkerqueScale = biologicalActivityFactor({
      ...BASE,
      spot: { ...SEARCHED, meanSpringRange: DEFAULT_SPOT.meanSpringRange },
      tidalRange: 0.33,
    });
    const withLocalScale = biologicalActivityFactor({
      ...BASE,
      spot: rescaled,
      tidalRange: 0.33,
    });

    assert.equal(withDunkerqueScale.detail.tidalRangeScore, 0.3);
    assert.equal(withLocalScale.detail.tidalRangeScore, 1);
    assert.ok(withLocalScale.value > withDunkerqueScale.value);
  });

  it('drops the range sub-score rather than guessing when there is no scale', () => {
    const factor = biologicalActivityFactor({ ...BASE, spot: SEARCHED, tidalRange: 0.33 });
    assert.equal(factor.detail.tidalRangeScore, null);
    assert.equal(factor.estimated, true);
    // Re-normalised over coefficient and current, so it is not dragged down.
    assert.ok(factor.value > 0.9);
  });
});

describe('coefficientFor', () => {
  it('uses the calibrated unit height when there is one', () => {
    const events = findTideExtrema(curve(5.5));
    assert.equal(coefficientFor(DEFAULT_SPOT, events, 5.5), coefficientFromRange(5.5, 2.75));
  });

  it('derives one otherwise, so a small tide is not always coefficient 20', () => {
    const events = findTideExtrema(curve(0.35));
    const coefficient = coefficientFor(SEARCHED, events, 0.34);
    assert.ok(coefficient !== null);
    assert.ok(coefficient > 80, `got ${coefficient}`);

    // With Dunkerque's scale the same tide would bottom out.
    assert.equal(coefficientFromRange(0.34, 2.75), 20);
  });

  it('returns null without a range', () => {
    assert.equal(coefficientFor(SEARCHED, [], null), null);
  });
});

describe('scoring a searched spot end to end', () => {
  it('produces a usable score and flags it as partial', () => {
    const result = computeScore({ ...BASE, spot: SEARCHED });
    assert.ok(result.score > 0 && result.score <= 100);
    // Wind direction and tidal range are both unavailable here.
    assert.equal(result.partial, true);
  });
});
