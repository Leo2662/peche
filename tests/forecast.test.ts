import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findTideExtrema, tidalRangeAt, coefficientFromRange } from '../src/api/tides/tideMath';
import { DEFAULT_SPOT } from '../src/config/spots';
import { findBestWindow, MAX_WINDOW_MS, MIN_WINDOW_MS } from '../src/scoring/bestWindow';
import { buildInputs } from '../src/scoring/buildInputs';
import { buildForecast } from '../src/scoring/forecast';
import { sampleSeries } from '../src/utils/series';
import { getMoonInfo, getSunTimes } from '../src/utils/moon';
import { HOUR, MINUTE, parseUtcIso } from '../src/utils/time';
import type { MarineSample, TideData, WeatherSample } from '../src/types';

const NOW = Date.UTC(2026, 6, 30, 12, 0);
const TIDAL_PERIOD = 12.42 * HOUR;

function buildFixture(): { weather: WeatherSample[]; marine: MarineSample[]; tide: TideData } {
  const start = NOW - 24 * HOUR;
  const highWater = NOW + 7 * HOUR;

  const weather: WeatherSample[] = [];
  const marine: MarineSample[] = [];

  for (let i = 0; i <= 72; i += 1) {
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

  it('samples the timeline every 10 minutes across 24 h', () => {
    const span = forecast.timeline[forecast.timeline.length - 1].time - forecast.timeline[0].time;
    assert.equal(span, 24 * HOUR);
    assert.equal(forecast.timeline[1].time - forecast.timeline[0].time, 10 * MINUTE);
  });

  it('finds a best window bracketing a high water', () => {
    assert.ok(forecast.bestWindow);
    const { start, end, peakScore } = forecast.bestWindow;
    assert.ok(end > start);
    assert.ok(peakScore >= forecast.now.score - 100 && peakScore <= 100);

    const nearestHigh = raw.tide.events
      .filter((e) => e.type === 'high')
      .map((e) => Math.abs(e.time - (start + end) / 2))
      .sort((a, b) => a - b)[0];
    assert.ok(nearestHigh < 3 * HOUR, 'best window should sit near a high water');
  });

  it('reports the next high and low tide', () => {
    assert.ok(forecast.tide.nextHigh && forecast.tide.nextHigh.time >= NOW);
    assert.ok(forecast.tide.nextLow && forecast.tide.nextLow.time >= NOW);
  });

  it('is serialisable, so it can be cached for offline use', () => {
    const roundTripped = JSON.parse(JSON.stringify(forecast));
    assert.equal(roundTripped.now.score, forecast.now.score);
    assert.equal(roundTripped.bestWindow.start, forecast.bestWindow?.start);
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
