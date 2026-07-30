import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SPOT } from '../src/config/spots';
import { computeScore, getVerdict } from '../src/scoring/computeScore';
import { WEIGHTS, FACTOR_ORDER } from '../src/scoring/weights';
import type { ScoreInputs } from '../src/types';
import { HOUR } from '../src/utils/time';

const NOW = Date.UTC(2026, 6, 30, 19, 0);

/** Every factor at its maximum. */
const PERFECT: ScoreInputs = {
  time: NOW,
  spot: DEFAULT_SPOT,
  tideCoefficient: 105,
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

/** Every factor at or near its minimum. */
const TERRIBLE: ScoreInputs = {
  time: Date.UTC(2026, 6, 30, 12),
  spot: DEFAULT_SPOT,
  tideCoefficient: 25,
  currentVelocity: 0.05,
  tidalRange: 1.2,
  hoursFromHighTide: 6,
  windSpeed: 55,
  windDirection: 90,
  windGusts: 80,
  waveHeight: 3.5,
  wavePeriod: 3,
  cloudCover: 0,
  sun: {
    sunrise: Date.UTC(2026, 6, 30, 4),
    sunset: Date.UTC(2026, 6, 30, 20),
  },
  seaTemperature: 29,
  pressureTrend6h: -9,
};

describe('weights', () => {
  it('sum to exactly 1', () => {
    const total = FACTOR_ORDER.reduce((sum, key) => sum + WEIGHTS[key], 0);
    assert.ok(Math.abs(total - 1) < 1e-12, `weights sum to ${total}`);
  });
});

describe('computeScore', () => {
  it('reaches 100 when every factor is perfect', () => {
    const result = computeScore(PERFECT);
    assert.equal(result.score, 100);
    assert.equal(result.partial, false);
    for (const key of FACTOR_ORDER) {
      assert.equal(result.factors[key].value, 1, `${key} should be 1`);
    }
  });

  it('collapses when every factor is bad', () => {
    const result = computeScore(TERRIBLE);
    assert.ok(result.score < 30, `expected a low score, got ${result.score}`);
    assert.ok(result.score >= 0);
  });

  it('stays inside 0–100 for arbitrary garbage inputs', () => {
    const extremes: ScoreInputs = {
      ...PERFECT,
      tideCoefficient: 1e6,
      currentVelocity: -50,
      tidalRange: -3,
      hoursFromHighTide: -400,
      windSpeed: 1e5,
      windDirection: -720,
      waveHeight: -2,
      wavePeriod: 1e4,
      cloudCover: 900,
      seaTemperature: -100,
      pressureTrend6h: 1e5,
    };
    const result = computeScore(extremes);
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it('flags a partial result and stays neutral when data is missing', () => {
    const empty: ScoreInputs = {
      time: NOW,
      spot: DEFAULT_SPOT,
      tideCoefficient: null,
      currentVelocity: null,
      tidalRange: null,
      hoursFromHighTide: null,
      windSpeed: null,
      windDirection: null,
      windGusts: null,
      waveHeight: null,
      wavePeriod: null,
      cloudCover: null,
      sun: null,
      seaTemperature: null,
      pressureTrend6h: null,
    };
    const result = computeScore(empty);
    assert.equal(result.partial, true);
    assert.equal(result.score, 50);
  });

  it('is a weighted blend of its factors', () => {
    const result = computeScore(PERFECT);
    const recomputed = FACTOR_ORDER.reduce(
      (sum, key) => sum + result.factors[key].value * WEIGHTS[key],
      0
    );
    assert.equal(Math.round(recomputed * 100), result.score);
  });

  it('weights biological activity most heavily', () => {
    const withGoodTide = computeScore(PERFECT);
    const withDeadTide = computeScore({
      ...PERFECT,
      tideCoefficient: 25,
      currentVelocity: 0.05,
      tidalRange: 1.2,
    });
    // 0.35 × (1 − 0.3) = 24.5 points.
    assert.equal(withGoodTide.score - withDeadTide.score, 25);
  });
});

describe('verdict bands', () => {
  it('matches the design thresholds', () => {
    assert.equal(getVerdict(100), 'EXCELLENT');
    assert.equal(getVerdict(90), 'EXCELLENT');
    assert.equal(getVerdict(89), 'GOOD');
    assert.equal(getVerdict(70), 'GOOD');
    assert.equal(getVerdict(69), 'AVERAGE');
    assert.equal(getVerdict(50), 'AVERAGE');
    assert.equal(getVerdict(49), 'POOR');
    assert.equal(getVerdict(0), 'POOR');
  });
});
