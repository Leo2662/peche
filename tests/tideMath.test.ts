import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  coefficientFromRange,
  estimateCurrentFromCurve,
  findTideExtrema,
  hoursFromHighTide,
  nextEvent,
  tidalRangeAt,
  type HeightPoint,
} from '../src/api/tides/tideMath';
import { DEFAULT_SPOT } from '../src/config/spots';
import { HOUR, MINUTE } from '../src/utils/time';

const UNIT_HEIGHT = DEFAULT_SPOT.tidalUnitHeight as number;

const START = Date.UTC(2026, 6, 30, 0, 0);
/** Mean semi-diurnal (M2) period. */
const TIDAL_PERIOD = 12.42 * HOUR;

/** Hourly sea-level curve for a tide of the given range, high water at `phase`. */
function syntheticCurve(range: number, phase: number, hours = 48): HeightPoint[] {
  const points: HeightPoint[] = [];
  for (let i = 0; i < hours; i += 1) {
    const time = START + i * HOUR;
    const angle = (2 * Math.PI * (time - phase)) / TIDAL_PERIOD;
    points.push({ time, height: (range / 2) * Math.cos(angle) });
  }
  return points;
}

describe('findTideExtrema', () => {
  const highWater = START + 3 * HOUR;
  const events = findTideExtrema(syntheticCurve(5.4, highWater));

  it('finds roughly two highs and two lows per day', () => {
    const highs = events.filter((e) => e.type === 'high');
    const lows = events.filter((e) => e.type === 'low');
    assert.ok(highs.length >= 3 && highs.length <= 4, `got ${highs.length} highs in 48 h`);
    assert.ok(lows.length >= 3 && lows.length <= 4, `got ${lows.length} lows in 48 h`);
  });

  it('alternates high and low', () => {
    for (let i = 1; i < events.length; i += 1) {
      assert.notEqual(events[i].type, events[i - 1].type);
    }
  });

  it('recovers high-water timing to better than the sampling interval', () => {
    const firstHigh = events.find((e) => e.type === 'high');
    assert.ok(firstHigh);
    const errorMinutes = Math.abs(firstHigh.time - highWater) / MINUTE;
    assert.ok(errorMinutes < 15, `high water off by ${errorMinutes.toFixed(1)} min`);
  });

  it('recovers the amplitude, not just the sampled peak', () => {
    const firstHigh = events.find((e) => e.type === 'high');
    assert.ok(firstHigh);
    assert.ok(Math.abs(firstHigh.height - 2.7) < 0.05, `height was ${firstHigh.height}`);
  });

  it('returns nothing for a degenerate series', () => {
    assert.deepEqual(findTideExtrema([]), []);
    assert.deepEqual(findTideExtrema([{ time: START, height: 1 }]), []);
  });
});

describe('tidalRangeAt', () => {
  it('measures the range of the cycle around the given time', () => {
    const events = findTideExtrema(syntheticCurve(5.4, START + 3 * HOUR));
    const range = tidalRangeAt(events, START + 6 * HOUR);
    assert.ok(range !== null);
    assert.ok(Math.abs(range - 5.4) < 0.15, `range was ${range}`);
  });
});

describe('coefficientFromRange', () => {
  it('maps the mean spring range to ≈100', () => {
    const coefficient = coefficientFromRange(DEFAULT_SPOT.meanSpringRange as number, UNIT_HEIGHT);
    assert.equal(coefficient, 100);
  });

  it('maps a small neap range low and clamps to the 20–120 scale', () => {
    assert.ok(coefficientFromRange(2.6, UNIT_HEIGHT) < 55);
    assert.equal(coefficientFromRange(0.1, UNIT_HEIGHT), 20);
    assert.equal(coefficientFromRange(20, UNIT_HEIGHT), 120);
  });
});

describe('hoursFromHighTide', () => {
  const highWater = START + 3 * HOUR;
  const events = findTideExtrema(syntheticCurve(5.4, highWater));

  it('is negative before high water and positive after', () => {
    const before = hoursFromHighTide(events, highWater - 90 * MINUTE);
    const after = hoursFromHighTide(events, highWater + 90 * MINUTE);
    assert.ok(before !== null && before < 0);
    assert.ok(after !== null && after > 0);
    assert.ok(Math.abs(before + 1.5) < 0.3);
    assert.ok(Math.abs(after - 1.5) < 0.3);
  });

  it('never reports more than half a tidal cycle away', () => {
    for (let i = 0; i < 48; i += 1) {
      const hours = hoursFromHighTide(events, START + i * HOUR);
      if (hours !== null) assert.ok(Math.abs(hours) <= 6.5);
    }
  });

  it('returns null with no known high water', () => {
    assert.equal(hoursFromHighTide([], START), null);
  });
});

describe('estimateCurrentFromCurve', () => {
  const curve = syntheticCurve(5.5, START + 3 * HOUR);

  it('is near zero at slack water and strongest at mid-tide', () => {
    const slack = estimateCurrentFromCurve(curve, START + 3 * HOUR);
    const midTide = estimateCurrentFromCurve(curve, START + 6 * HOUR);
    assert.ok(slack !== null && midTide !== null);
    assert.ok(midTide > slack * 2, `slack=${slack}, mid=${midTide}`);
  });

  it('produces a plausible spring peak for Dunkerque (≈1 m/s)', () => {
    let peak = 0;
    for (let i = 0; i < 24; i += 1) {
      peak = Math.max(peak, estimateCurrentFromCurve(curve, START + i * HOUR) ?? 0);
    }
    assert.ok(peak > 0.6 && peak < 1.6, `peak current was ${peak.toFixed(2)} m/s`);
  });

  it('returns null without a usable curve', () => {
    assert.equal(estimateCurrentFromCurve([], START), null);
  });
});

describe('nextEvent', () => {
  it('finds the next high and low after a time', () => {
    const events = findTideExtrema(syntheticCurve(5.4, START + 3 * HOUR));
    const high = nextEvent(events, START + 4 * HOUR, 'high');
    const low = nextEvent(events, START + 4 * HOUR, 'low');
    assert.ok(high && high.time >= START + 4 * HOUR && high.type === 'high');
    assert.ok(low && low.time >= START + 4 * HOUR && low.type === 'low');
  });

  it('returns null past the end of the series', () => {
    assert.equal(nextEvent([], START, 'high'), null);
  });
});
