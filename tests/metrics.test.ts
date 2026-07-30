import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SPOT } from '../src/config/spots';
import { FORECAST_DAYS } from '../src/config/env';
import { computeScore } from '../src/scoring/computeScore';
import { factorMetrics, metricsForFactor } from '../src/scoring/factorMetrics';
import { buildForecast } from '../src/scoring/forecast';
import { FACTOR_ORDER } from '../src/scoring/weights';
import { findTideExtrema, tidalRangeAt, coefficientFromRange } from '../src/api/tides/tideMath';
import { compassPoint, formatMetric } from '../src/utils/format';
import { HOUR } from '../src/utils/time';
import type { MarineSample, ScoreInputs, WeatherSample } from '../src/types';

const NOW = Date.UTC(2026, 6, 30, 19, 0);

const PEAK: ScoreInputs = {
  time: NOW,
  spot: DEFAULT_SPOT,
  tideCoefficient: 103,
  currentVelocity: 0.82,
  tidalRange: 5.2,
  hoursFromHighTide: -1.2,
  windSpeed: 22,
  windDirection: 250,
  windGusts: 33,
  waveHeight: 1.05,
  wavePeriod: 9,
  cloudCover: 85,
  sun: { sunrise: NOW - 14 * HOUR, sunset: NOW + 0.5 * HOUR },
  seaTemperature: 16.4,
  pressureTrend6h: 0.4,
};

describe('factorMetrics', () => {
  const result = computeScore(PEAK);

  it('leads with the figure that best explains each factor', () => {
    assert.equal(metricsForFactor(result, 'biologicalActivity')[0].key, 'currentVelocity');
    // The reason word already names the sector, so speed is the headline.
    assert.equal(metricsForFactor(result, 'wind')[0].key, 'windSpeed');
    assert.equal(metricsForFactor(result, 'waves')[0].key, 'waveHeight');
    assert.equal(metricsForFactor(result, 'waterTemperature')[0].key, 'seaTemperature');
  });

  it('reports the measured values, not the scores', () => {
    const metrics = metricsForFactor(result, 'biologicalActivity');
    assert.equal(metrics.find((m) => m.key === 'currentVelocity')?.value, 0.82);
    assert.equal(metrics.find((m) => m.key === 'tideCoefficient')?.value, 103);
    assert.equal(metrics.find((m) => m.key === 'tidalRange')?.value, 5.2);
  });

  it('gives every factor at least one metric', () => {
    for (const key of FACTOR_ORDER) {
      assert.ok(metricsForFactor(result, key).length > 0, `${key} has no metric`);
    }
  });

  it('drops metrics whose reading is missing rather than showing zero', () => {
    const noWaves = computeScore({ ...PEAK, waveHeight: null, wavePeriod: null });
    assert.deepEqual(factorMetrics(noWaves.factors.waves), []);

    const noGusts = computeScore({ ...PEAK, windGusts: null });
    const keys = factorMetrics(noGusts.factors.wind).map((m) => m.key);
    assert.ok(!keys.includes('windGusts'));
    assert.ok(keys.includes('windSpeed'));
  });
});

describe('formatMetric', () => {
  it('formats in French, with a comma for decimals', () => {
    assert.deepEqual(formatMetric('currentVelocity', 0.82), {
      label: 'COURANT',
      value: '0,82',
      unit: 'm/s',
    });
    assert.equal(formatMetric('seaTemperature', 16.4).value, '16,4');
    assert.equal(formatMetric('tidalRange', 5.2).value, '5,2');
  });

  it('rounds whole-number quantities', () => {
    assert.equal(formatMetric('windSpeed', 21.7).value, '22');
    assert.equal(formatMetric('tideCoefficient', 102.6).value, '103');
    assert.equal(formatMetric('cloudCover', 84.6).value, '85');
  });

  it('says how far the tide is, and on which side', () => {
    const before = formatMetric('hoursFromHighTide', -1.2);
    assert.equal(before.value, '1 h 12');
    assert.equal(before.unit, 'avant');

    const after = formatMetric('hoursFromHighTide', 0.75);
    assert.equal(after.value, '45 min');
    assert.equal(after.unit, 'après');
  });

  it('keeps the sign on a pressure trend, where it carries the meaning', () => {
    assert.equal(formatMetric('pressureTrend6h', 2.4).value, '+2,4');
    assert.equal(formatMetric('pressureTrend6h', -2.4).value, '−2,4');
    assert.equal(formatMetric('pressureTrend6h', 0).value, '0,0');
  });

  it('names the wind sector in French', () => {
    assert.equal(compassPoint(0), 'N');
    assert.equal(compassPoint(90), 'E');
    assert.equal(compassPoint(225), 'SO');
    assert.equal(compassPoint(270), 'O');
    assert.equal(compassPoint(315), 'NO');
    assert.equal(compassPoint(-45), 'NO');
    // 250° is past the 247.5° boundary, so it is west and not south-west.
    assert.equal(compassPoint(250), 'O');
    assert.equal(compassPoint(240), 'SO');

    assert.equal(formatMetric('windDirection', 250).value, 'O');
    assert.equal(formatMetric('windDirection', 250).unit, '250°');
  });
});

describe('factor series', () => {
  const start = NOW - 24 * HOUR;
  const TIDAL_PERIOD = 12.42 * HOUR;
  const weather: WeatherSample[] = [];
  const marine: MarineSample[] = [];

  for (let i = 0; i <= 24 + (FORECAST_DAYS + 1) * 24; i += 1) {
    const time = start + i * HOUR;
    const angle = (2 * Math.PI * (time - (NOW + 3 * HOUR))) / TIDAL_PERIOD;
    weather.push({
      time,
      windSpeed: 20,
      windDirection: 270,
      windGusts: 30,
      cloudCover: 80,
      pressure: 1015,
      airTemperature: 18,
    });
    marine.push({
      time,
      waveHeight: 1,
      wavePeriod: 9,
      seaTemperature: 16,
      seaLevel: 2.75 * Math.cos(angle),
      currentVelocity: null,
    });
  }

  const heights = marine.map((s) => ({ time: s.time, height: s.seaLevel as number }));
  const events = findTideExtrema(heights);
  const range = tidalRangeAt(events, NOW);
  const forecast = buildForecast(
    {
      spot: DEFAULT_SPOT,
      weather,
      marine,
      tide: {
        events,
        heights,
        range,
        coefficient: range === null ? null : coefficientFromRange(range, DEFAULT_SPOT),
        source: 'test',
      },
    },
    NOW
  );

  it('samples every factor hourly for every day', () => {
    for (const day of forecast.days) {
      assert.equal(day.series.step, HOUR);
      for (const key of FACTOR_ORDER) {
        const values = day.series.values[key];
        assert.ok(values.length > 0, `${key} has no series on ${day.key}`);
        for (const value of values) {
          assert.ok(value >= 0 && value <= 1, `${key} out of range: ${value}`);
        }
      }
    }
  });

  it('covers a full day on the complete days', () => {
    const complete = forecast.days.find((day) => day.complete);
    assert.ok(complete);
    assert.equal(complete.series.values.tideWindow.length, 24);
  });

  it('lines the series up with the window it will highlight', () => {
    const day = forecast.days.find((d) => d.windows.length > 0);
    assert.ok(day);
    const window = day.windows[0];

    const index = Math.round((window.peakTime - day.series.start) / day.series.step);
    assert.ok(index >= 0 && index < day.series.values.tideWindow.length, `index ${index}`);
    // The peak of the window must be at or near the top of the tide curve.
    assert.ok(day.series.values.tideWindow[index] >= 0.8);
  });

  it('attaches the peak breakdown to every real window', () => {
    for (const day of forecast.days) {
      for (const window of day.windows) {
        assert.ok(window.peak, `no breakdown on ${day.key}`);
        assert.equal(window.peak.score, window.peakScore);
        assert.equal(window.peak.time, window.peakTime);
        assert.ok(metricsForFactor(window.peak, 'tideWindow').length > 0);
      }
    }
  });

  it('stays small enough to cache', () => {
    const bytes = JSON.stringify(forecast).length;
    assert.ok(bytes < 400_000, `forecast serialises to ${bytes} bytes`);
  });
});
