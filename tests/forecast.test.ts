import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findTideExtrema, tidalRangeAt, coefficientFromRange } from '../src/api/tides/tideMath';
import { DEFAULT_SPOT } from '../src/config/spots';
import { FORECAST_DAYS, MAX_WINDOWS_PER_DAY } from '../src/config/env';
import {
  findBestWindow,
  findWindows,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  WINDOW_SEPARATION_MS,
} from '../src/scoring/bestWindow';
import { buildInputs } from '../src/scoring/buildInputs';
import { buildForecast, groupIntoDays } from '../src/scoring/forecast';
import { sampleSeries } from '../src/utils/series';
import { getMoonInfo, getSunTimes } from '../src/utils/moon';
import { HOUR, MINUTE, parseUtcIso, zonedDayKey } from '../src/utils/time';
import type { MarineSample, TideData, WeatherSample } from '../src/types';

const NOW = Date.UTC(2026, 6, 30, 12, 0);
const TIDAL_PERIOD = 12.42 * HOUR;

function buildFixture(): { weather: WeatherSample[]; marine: MarineSample[]; tide: TideData } {
  const start = NOW - 24 * HOUR;
  const highWater = NOW + 7 * HOUR;

  const weather: WeatherSample[] = [];
  const marine: MarineSample[] = [];

  // A day behind (for the 6 h pressure trend) and well past the selectable
  // horizon, so every day the UI can offer is backed by real fixture data.
  for (let i = 0; i <= 24 + (FORECAST_DAYS + 1) * 24; i += 1) {
    const time = start + i * HOUR;
    const angle = (2 * Math.PI * (time - highWater)) / TIDAL_PERIOD;

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
      currentVelocity: null, // force the tide-curve fallback
    });
  }

  const heights = marine.map((s) => ({ time: s.time, height: s.seaLevel as number }));
  const events = findTideExtrema(heights);
  const range = tidalRangeAt(events, NOW);

  return {
    weather,
    marine,
    tide: {
      events,
      heights,
      range,
      coefficient: range === null ? null : coefficientFromRange(range, DEFAULT_SPOT),
      source: 'test',
    },
  };
}

describe('sampleSeries', () => {
  const samples = [
    { time: 0, value: 0 },
    { time: 100, value: 10 },
    { time: 200, value: null as number | null },
    { time: 300, value: 30 },
  ];

  it('interpolates between samples', () => {
    assert.equal(sampleSeries(samples, 50, (s) => s.value), 5);
    assert.equal(sampleSeries(samples, 0, (s) => s.value), 0);
    assert.equal(sampleSeries(samples, 100, (s) => s.value), 10);
  });

  it('bridges a gap in the field', () => {
    assert.equal(sampleSeries(samples, 200, (s) => s.value), 20);
  });

  it('holds the edge value outside the series', () => {
    assert.equal(sampleSeries(samples, -500, (s) => s.value), 0);
    assert.equal(sampleSeries(samples, 5000, (s) => s.value), 30);
  });

  it('returns null when nothing is available', () => {
    assert.equal(sampleSeries([], 0, () => 1), null);
    assert.equal(sampleSeries(samples, 50, () => null), null);
  });
});

describe('buildInputs', () => {
  const raw = { spot: DEFAULT_SPOT, ...buildFixture() };

  it('estimates current from the tide curve when the model has none', () => {
    const inputs = buildInputs(raw, NOW);
    assert.ok(inputs.currentVelocity !== null);
    assert.ok(inputs.currentVelocity > 0);
  });

  it('derives a spring coefficient from a 5.5 m range', () => {
    const inputs = buildInputs(raw, NOW);
    assert.ok(inputs.tideCoefficient !== null);
    assert.ok(Math.abs(inputs.tideCoefficient - 100) <= 3, `got ${inputs.tideCoefficient}`);
  });

  it('reports the signed distance to high water', () => {
    const inputs = buildInputs(raw, NOW);
    assert.ok(inputs.hoursFromHighTide !== null);
    // High water is 7 h ahead, so `now` is closer to the *previous* high.
    assert.ok(Math.abs(inputs.hoursFromHighTide) <= 6.5);
  });

  it('interpolates wind direction as a vector, not a scalar', () => {
    const wrapping = {
      spot: DEFAULT_SPOT,
      ...buildFixture(),
    };
    wrapping.weather = wrapping.weather.map((s, i) => ({
      ...s,
      windDirection: i % 2 === 0 ? 350 : 10,
    }));

    const inputs = buildInputs(wrapping, wrapping.weather[1].time + 30 * MINUTE);
    assert.ok(inputs.windDirection !== null);
    // Naive averaging would give 180°; the true answer is near 0°/360°.
    const distanceToNorth = Math.min(inputs.windDirection, 360 - inputs.windDirection);
    assert.ok(distanceToNorth < 30, `interpolated to ${inputs.windDirection}°`);
  });
});

describe('buildForecast', () => {
  const raw = { spot: DEFAULT_SPOT, ...buildFixture() };
  const forecast = buildForecast(raw, NOW);

  it('produces a score in range with a timeline', () => {
    assert.ok(forecast.now.score >= 0 && forecast.now.score <= 100);
    assert.ok(forecast.timeline.length > 100);
    assert.equal(forecast.timeline[0].time, NOW);
  });

  it('samples the timeline every 10 minutes across the whole horizon', () => {
    const span = forecast.timeline[forecast.timeline.length - 1].time - forecast.timeline[0].time;
    assert.equal(span, FORECAST_DAYS * 24 * HOUR);
    assert.equal(forecast.timeline[1].time - forecast.timeline[0].time, 10 * MINUTE);
  });

  it('offers exactly one selectable day per forecast day, starting today', () => {
    assert.equal(forecast.days.length, FORECAST_DAYS);
    assert.equal(forecast.days[0].key, zonedDayKey(NOW, DEFAULT_SPOT.timezone));

    const keys = forecast.days.map((day) => day.key);
    assert.deepEqual(keys, [...keys].sort(), 'days must be chronological');
    assert.equal(new Set(keys).size, keys.length, 'days must be unique');
  });

  it('marks today incomplete and the middle days complete', () => {
    assert.equal(forecast.days[0].complete, false);
    assert.equal(forecast.days[3].complete, true);
  });

  it('finds windows bracketing a high water on every day', () => {
    const highs = raw.tide.events.filter((e) => e.type === 'high');

    for (const day of forecast.days) {
      assert.ok(day.windows.length >= 1, `no window on ${day.key}`);
      assert.ok(day.windows.length <= MAX_WINDOWS_PER_DAY);

      for (const window of day.windows) {
        assert.ok(window.end > window.start);
        assert.ok(window.peakScore <= day.peakScore);

        const centre = (window.start + window.end) / 2;
        const nearestHigh = Math.min(...highs.map((e) => Math.abs(e.time - centre)));
        assert.ok(nearestHigh < 3 * HOUR, `window on ${day.key} is not near a high water`);
      }
    }
  });

  it('keeps each day’s windows chronological, separated and inside the day', () => {
    for (const day of forecast.days) {
      for (let i = 1; i < day.windows.length; i += 1) {
        assert.ok(day.windows[i].start > day.windows[i - 1].start, 'windows out of order');
        assert.ok(
          day.windows[i].start - day.windows[i - 1].end >= WINDOW_SEPARATION_MS - 10 * MINUTE,
          'windows are two halves of the same tide'
        );
      }

      for (const window of day.windows) {
        const dayOf = zonedDayKey(window.start, DEFAULT_SPOT.timezone);
        assert.equal(dayOf, day.key, 'window leaked into a neighbouring day');
      }
    }
  });

  it('reports the next high and low tide', () => {
    assert.ok(forecast.tide.nextHigh && forecast.tide.nextHigh.time >= NOW);
    assert.ok(forecast.tide.nextLow && forecast.tide.nextLow.time >= NOW);
  });

  it('is serialisable, so it can be cached for offline use', () => {
    const roundTripped = JSON.parse(JSON.stringify(forecast));
    assert.equal(roundTripped.now.score, forecast.now.score);
    assert.equal(roundTripped.days.length, forecast.days.length);
    assert.equal(roundTripped.days[0].windows[0]?.start, forecast.days[0].windows[0]?.start);
  });
});

describe('groupIntoDays', () => {
  const tz = DEFAULT_SPOT.timezone;

  it('splits on midnight in the spot timezone, not UTC', () => {
    // 23:30 Paris on 30 July is 21:30 UTC — a UTC split would put these on the
    // same day, a Paris split puts them either side of midnight.
    const before = Date.UTC(2026, 6, 30, 21, 30);
    const after = Date.UTC(2026, 6, 30, 22, 30);

    const days = groupIntoDays(
      [
        { time: before, score: 70 },
        { time: after, score: 70 },
      ],
      tz,
      before
    );

    assert.equal(days.length, 2);
    assert.equal(days[0].key, '2026-07-30');
    assert.equal(days[1].key, '2026-07-31');
  });

  it('caps the number of days at the forecast horizon', () => {
    const points = Array.from({ length: 20 * 24 }, (_, i) => ({
      time: NOW + i * HOUR,
      score: 60,
    }));
    assert.equal(groupIntoDays(points, tz, NOW).length, FORECAST_DAYS);
    assert.equal(groupIntoDays(points, tz, NOW, 3).length, 3);
  });

  it('returns a day with no windows rather than dropping it', () => {
    const points = Array.from({ length: 24 }, (_, i) => ({ time: NOW + i * HOUR, score: 10 }));
    const days = groupIntoDays(points, tz, NOW);
    assert.ok(days.length >= 1);
    assert.deepEqual(days[0].windows, []);
    assert.equal(days[0].peakScore, 10);
  });

  it('handles an empty timeline', () => {
    assert.deepEqual(groupIntoDays([], tz, NOW), []);
  });
});

describe('findWindows', () => {
  it('separates two tides into two windows', () => {
    // Two 90-minute humps six hours apart, like a pair of high waters.
    const points = Array.from({ length: 6 * 12 + 1 }, (_, i) => {
      const time = NOW + i * 10 * MINUTE;
      const hours = i / 6;
      const near = (centre: number) => Math.abs(hours - centre) <= 0.75;
      return { time, score: near(1) || near(6) ? 80 : 40 };
    });

    const windows = findWindows(points, 3);
    assert.equal(windows.length, 2);
    assert.ok(windows[1].start - windows[0].end >= WINDOW_SEPARATION_MS - 10 * MINUTE);
  });

  it('does not split one plateau into several windows', () => {
    const points = Array.from({ length: 25 }, (_, i) => ({
      time: NOW + i * 10 * MINUTE,
      score: i >= 6 && i <= 18 ? 80 : 30,
    }));
    assert.equal(findWindows(points, 3).length, 1);
  });

  /** Two humps of the given peak scores, six hours apart. */
  function twoHumps(firstScore: number, secondScore: number) {
    return Array.from({ length: 6 * 12 + 1 }, (_, i) => {
      const hours = i / 6;
      const near = (centre: number) => Math.abs(hours - centre) <= 0.75;
      let score = 40;
      if (near(1)) score = firstScore;
      if (near(6)) score = secondScore;
      return { time: NOW + i * 10 * MINUTE, score };
    });
  }

  it('returns best-scoring first', () => {
    const windows = findWindows(twoHumps(88, 95), 3);
    assert.equal(windows.length, 2);
    assert.equal(windows[0].peakScore, 95);
    assert.equal(windows[1].peakScore, 88);
  });

  it('drops a second window that is far worse than the best', () => {
    // 95 vs 70 is a 25-point drop — not a real second chance.
    const windows = findWindows(twoHumps(70, 95), 3);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].peakScore, 95);

    // …but it is offered when the two tides are comparable.
    assert.equal(findWindows(twoHumps(85, 95), 3).length, 2);
  });

  it('respects maxCount and degenerate inputs', () => {
    assert.deepEqual(findWindows([], 3), []);
    assert.deepEqual(findWindows([{ time: NOW, score: 90 }], 0), []);
  });
});

describe('findBestWindow', () => {
  it('grows the plateau around the peak', () => {
    const scores = [40, 62, 88, 90, 85, 50];
    const timeline = scores.map((score, i) => ({ time: NOW + i * HOUR, score }));

    const window = findBestWindow(timeline);
    assert.ok(window);
    assert.equal(window.peakScore, 90);
    // Grows out to the 88 and 85 either side, and stops at 62 / 50.
    assert.equal(window.start, NOW + 2 * HOUR);
    assert.equal(window.end, NOW + 4 * HOUR);
  });

  it('reports no window when nothing is worth fishing', () => {
    assert.equal(findBestWindow([{ time: 0, score: 20 }]), null);
    assert.equal(findBestWindow([]), null);
  });

  it('pads an isolated spike to a usable length', () => {
    const window = findBestWindow([
      { time: NOW, score: 10 },
      { time: NOW + 10 * MINUTE, score: 80 },
      { time: NOW + 20 * MINUTE, score: 10 },
    ]);
    assert.ok(window);
    assert.equal(window.end - window.start, MIN_WINDOW_MS);
  });

  it('trims a long plateau to the best few hours', () => {
    // Eight flat hours at 80, with the last two nudged higher.
    const timeline = Array.from({ length: 49 }, (_, i) => ({
      time: NOW + i * 10 * MINUTE,
      score: i >= 36 ? 82 : 80,
    }));

    const window = findBestWindow(timeline);
    assert.ok(window);
    assert.ok(
      window.end - window.start <= MAX_WINDOW_MS,
      `window spanned ${(window.end - window.start) / HOUR} h`
    );
    // The trim keeps the highest-scoring stretch, i.e. the tail.
    assert.ok(window.end >= NOW + 7 * HOUR);
  });
});

describe('local astronomy', () => {
  it('computes sunrise before sunset at Dunkerque in July', () => {
    const sun = getSunTimes(NOW, DEFAULT_SPOT.latitude, DEFAULT_SPOT.longitude);
    assert.ok(sun);
    assert.ok(sun.sunrise < sun.sunset);
    // Northern France, high summer: a long day.
    const dayLength = (sun.sunset - sun.sunrise) / HOUR;
    assert.ok(dayLength > 14 && dayLength < 17, `day length ${dayLength.toFixed(1)} h`);
  });

  it('computes a moon phase without any network call', () => {
    const moon = getMoonInfo(NOW);
    assert.ok(moon.phase >= 0 && moon.phase <= 1);
    assert.ok(moon.illumination >= 0 && moon.illumination <= 1);
    assert.ok(moon.label.length > 0);
  });
});

describe('parseUtcIso', () => {
  it('reads Open-Meteo timestamps as UTC regardless of device timezone', () => {
    assert.equal(parseUtcIso('2026-07-30T19:00'), Date.UTC(2026, 6, 30, 19, 0));
    assert.equal(parseUtcIso('2026-07-30T19:00Z'), Date.UTC(2026, 6, 30, 19, 0));
  });
});
