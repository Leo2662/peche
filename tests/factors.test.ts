import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SPOT } from '../src/config/spots';
import {
  currentScore,
  tideCoefficientScore,
  tidalRangeScore,
} from '../src/scoring/factors/biologicalActivity';
import { tideWindowScore } from '../src/scoring/factors/tideWindow';
import { windDirectionScore, windSpeedScore, windFactor } from '../src/scoring/factors/wind';
import { waveScore } from '../src/scoring/factors/waves';
import { cloudScore, twilightScore } from '../src/scoring/factors/light';
import { temperatureScore } from '../src/scoring/factors/waterTemperature';
import { pressureScore } from '../src/scoring/factors/pressure';
import type { ScoreInputs, SunTimes } from '../src/types';
import { HOUR } from '../src/utils/time';

const BASE_INPUTS: ScoreInputs = {
  time: Date.UTC(2026, 6, 30, 12),
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

describe('tide coefficient bands', () => {
  it('follows the specified bands', () => {
    assert.equal(tideCoefficientScore(118), 1);
    assert.equal(tideCoefficientScore(100), 1);
    assert.equal(tideCoefficientScore(95), 0.9);
    assert.equal(tideCoefficientScore(80), 0.9);
    assert.equal(tideCoefficientScore(70), 0.75);
    assert.equal(tideCoefficientScore(60), 0.75);
    assert.equal(tideCoefficientScore(45), 0.5);
    assert.equal(tideCoefficientScore(40), 0.5);
    assert.equal(tideCoefficientScore(30), 0.3);
  });
});

describe('current bands', () => {
  it('peaks in the 0.5–1.2 m/s race and eases off above it', () => {
    assert.equal(currentScore(0.05), 0.3);
    assert.equal(currentScore(0.2), 0.6);
    assert.equal(currentScore(0.45), 0.6);
    assert.equal(currentScore(0.5), 1);
    assert.equal(currentScore(1.1), 1);
    assert.equal(currentScore(1.2), 0.7);
    assert.equal(currentScore(2), 0.7);
  });
});

describe('tidal range', () => {
  it('scores relative to the spot mean spring range', () => {
    const mean = DEFAULT_SPOT.meanSpringRange; // 5.5 m
    assert.equal(tidalRangeScore(5.4, mean), 1);
    assert.equal(tidalRangeScore(4.2, mean), 0.85);
    assert.equal(tidalRangeScore(3.2, mean), 0.7);
    assert.equal(tidalRangeScore(2.2, mean), 0.5);
    assert.equal(tidalRangeScore(1.4, mean), 0.3);
  });
});

describe('tide window', () => {
  it('treats −2 h → +2 h around high water as optimal', () => {
    assert.equal(tideWindowScore(-2), 1);
    assert.equal(tideWindowScore(-1), 1);
    assert.equal(tideWindowScore(0), 1);
    assert.equal(tideWindowScore(1), 1);
    assert.equal(tideWindowScore(2), 1);
  });

  it('degrades away from high water', () => {
    assert.equal(tideWindowScore(2.5), 0.8);
    assert.equal(tideWindowScore(-3), 0.8);
    assert.equal(tideWindowScore(3.5), 0.5);
    assert.equal(tideWindowScore(-4), 0.5);
    assert.equal(tideWindowScore(5), 0.2);
    assert.equal(tideWindowScore(-6), 0.2);
  });
});

describe('wind', () => {
  it('favours the westerly quadrant at Dunkerque', () => {
    assert.equal(windDirectionScore(270), 1); // W
    assert.equal(windDirectionScore(315), 1); // NW
    assert.equal(windDirectionScore(225), 1); // SW
    assert.equal(windDirectionScore(0), 0.8); // N
    assert.equal(windDirectionScore(360), 0.8); // wraps
    assert.equal(windDirectionScore(180), 0.6); // S
    assert.equal(windDirectionScore(90), 0.3); // E
  });

  it('follows the speed bands', () => {
    assert.equal(windSpeedScore(5), 0.5);
    assert.equal(windSpeedScore(12), 0.8);
    assert.equal(windSpeedScore(20), 1);
    assert.equal(windSpeedScore(35), 0.6);
    assert.equal(windSpeedScore(45), 0.2);
  });

  it('blends 0.6 direction with 0.4 speed', () => {
    const result = windFactor({
      ...BASE_INPUTS,
      windDirection: 90, // E → 0.3
      windSpeed: 20, // → 1
      windGusts: 25,
    });
    assert.ok(Math.abs(result.value - (0.6 * 0.3 + 0.4 * 1)) < 1e-9);
    assert.equal(result.estimated, false);
  });

  it('damps the speed component when gusts are dangerous', () => {
    const calm = windFactor({ ...BASE_INPUTS, windDirection: 270, windSpeed: 25, windGusts: 30 });
    const gusty = windFactor({ ...BASE_INPUTS, windDirection: 270, windSpeed: 25, windGusts: 75 });
    assert.ok(gusty.value < calm.value);
  });
});

describe('waves', () => {
  it('rewards 0.5–1.5 m at 7–12 s', () => {
    assert.equal(waveScore(1, 9), 1);
    assert.equal(waveScore(0.5, 7), 1);
    assert.equal(waveScore(1.5, 12), 1);
  });

  it('accepts a near miss and rejects the rest', () => {
    assert.equal(waveScore(1.8, 13), 0.8);
    assert.equal(waveScore(0.35, 6), 0.8);
    assert.equal(waveScore(3, 4), 0.3);
    assert.equal(waveScore(0.1, 9), 0.3);
  });

  it('judges on height alone when the period is missing', () => {
    assert.equal(waveScore(1, null), 1);
    assert.equal(waveScore(null, null), null);
  });
});

describe('light', () => {
  const sun: SunTimes = {
    sunrise: Date.UTC(2026, 6, 30, 4, 0),
    sunset: Date.UTC(2026, 6, 30, 20, 0),
  };

  it('peaks within an hour of sunrise or sunset', () => {
    assert.equal(twilightScore(sun.sunset - 30 * 60_000, sun), 1);
    assert.equal(twilightScore(sun.sunrise + 45 * 60_000, sun), 1);
  });

  it('ranks night above flat midday sun', () => {
    const midday = Date.UTC(2026, 6, 30, 12);
    const night = Date.UTC(2026, 6, 30, 23, 30);
    assert.equal(twilightScore(midday, sun), 0.35);
    assert.equal(twilightScore(night, sun), 0.6);
    assert.ok(twilightScore(night, sun) > twilightScore(midday, sun));
  });

  it('prefers cloud cover', () => {
    assert.equal(cloudScore(90), 1);
    assert.equal(cloudScore(55), 0.8);
    assert.equal(cloudScore(25), 0.6);
    assert.equal(cloudScore(5), 0.45);
  });

  it('uses the two-hour shoulder around twilight', () => {
    assert.equal(twilightScore(sun.sunset - 1.5 * HOUR, sun), 0.75);
  });
});

describe('water temperature', () => {
  it('peaks at 16 °C and reaches zero 12 °C away', () => {
    assert.equal(temperatureScore(16), 1);
    assert.ok(Math.abs(temperatureScore(10) - 0.5) < 1e-9);
    assert.ok(Math.abs(temperatureScore(22) - 0.5) < 1e-9);
    assert.equal(temperatureScore(4), 0);
    assert.equal(temperatureScore(28), 0);
    assert.equal(temperatureScore(35), 0);
    assert.equal(temperatureScore(-2), 0);
  });
});

describe('pressure', () => {
  it('rewards a settled airmass', () => {
    assert.equal(pressureScore(0), 1);
    assert.equal(pressureScore(-1.5), 1);
    assert.equal(pressureScore(2), 1);
    assert.equal(pressureScore(3), 0.7);
    assert.equal(pressureScore(-5), 0.7);
    assert.equal(pressureScore(8), 0.3);
    assert.equal(pressureScore(-9), 0.3);
  });
});
