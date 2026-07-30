import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STRINGS } from '../src/config/strings';
import { DEFAULT_SPOT } from '../src/config/spots';
import { computeScore } from '../src/scoring/computeScore';
import { explainScore, MAX_REASONS, REASON_THRESHOLD } from '../src/scoring/explain';
import { FACTOR_ORDER, WEIGHTS } from '../src/scoring/weights';
import type { ReasonKind, ScoreInputs } from '../src/types';
import { HOUR } from '../src/utils/time';

const NOW = Date.UTC(2026, 6, 30, 19, 0);

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

const kinds = (inputs: ScoreInputs): ReasonKind[] =>
  explainScore(computeScore(inputs)).map((reason) => reason.kind);

describe('explainScore', () => {
  it('never returns more than four reasons', () => {
    const reasons = explainScore(computeScore(PERFECT));
    assert.ok(reasons.length > 0);
    assert.ok(reasons.length <= MAX_REASONS, `got ${reasons.length}`);
  });

  it('orders by contribution, not by raw value', () => {
    const reasons = explainScore(computeScore(PERFECT));
    // Every factor is 1.0 here, so weight alone decides — biological activity
    // (0.35) must come before pressure (0.05).
    const contributions = reasons.map((r) => r.value * WEIGHTS[r.key]);
    for (let i = 1; i < contributions.length; i += 1) {
      assert.ok(contributions[i] <= contributions[i - 1], 'reasons are out of order');
    }
    assert.equal(reasons[0].key, 'biologicalActivity');
  });

  it('only reports genuinely favourable factors', () => {
    for (const reason of explainScore(computeScore(PERFECT))) {
      assert.ok(reason.value >= REASON_THRESHOLD, `${reason.kind} was only ${reason.value}`);
    }
  });

  it('names the state of the tide', () => {
    assert.ok(kinds({ ...PERFECT, hoursFromHighTide: 0 }).includes('slackHigh'));
    assert.ok(kinds({ ...PERFECT, hoursFromHighTide: -1.5 }).includes('flood'));
    assert.ok(kinds({ ...PERFECT, hoursFromHighTide: 1.5 }).includes('ebb'));
  });

  it('drops light from a perfect window — four heavier factors outrank it', () => {
    // Light is only worth 8 points; with everything at 1.0 the top four are
    // biological activity, tide, wind and waves.
    assert.deepEqual(kinds(PERFECT), ['current', 'slackHigh', 'windW', 'swell']);
  });

  it('tells dawn from dusk once light matters', () => {
    // Flat sea drops waves to 0.3 (worth 3 points), so light (8) moves up.
    const flat = { ...PERFECT, waveHeight: 0.05, wavePeriod: 2 };
    const atDusk = { ...flat, sun: { sunrise: NOW - 14 * HOUR, sunset: NOW + 0.5 * HOUR } };
    const atDawn = { ...flat, sun: { sunrise: NOW + 0.5 * HOUR, sunset: NOW + 14 * HOUR } };

    assert.ok(kinds(atDusk).includes('dusk'), kinds(atDusk).join(' '));
    assert.ok(kinds(atDawn).includes('dawn'), kinds(atDawn).join(' '));
  });

  it('names darkness when the tide and wind leave room for it', () => {
    // Light is the lightest factor that can still be a reason, so everything
    // below it in the ranking has to be out of the way first.
    const midnight = {
      ...PERFECT,
      waveHeight: 0.05,
      wavePeriod: 2,
      seaTemperature: 29,
      pressureTrend6h: -9,
      sun: { sunrise: NOW + 8 * HOUR, sunset: NOW - 6 * HOUR },
    };
    assert.ok(kinds(midnight).includes('night'), kinds(midnight).join(' '));
  });

  it('names the wind sector when the direction is what helps', () => {
    assert.ok(kinds({ ...PERFECT, windDirection: 270 }).includes('windW'));
    assert.ok(kinds({ ...PERFECT, windDirection: 315 }).includes('windNW'));
    assert.ok(kinds({ ...PERFECT, windDirection: 225 }).includes('windSW'));
    assert.ok(kinds({ ...PERFECT, windDirection: 0 }).includes('windN'));
  });

  it('falls back to strength when the direction is unremarkable', () => {
    // Easterly: direction 0.3, so only the 20 km/h speed can carry the factor.
    const easterly = kinds({ ...PERFECT, windDirection: 90 });
    assert.ok(!easterly.some((k) => k.startsWith('wind')));
  });

  it('prefers the strongest sub-score inside biological activity', () => {
    // Strong current wins…
    assert.ok(kinds({ ...PERFECT, currentVelocity: 0.9 }).includes('current'));
    // …and with a weak current, a big coefficient is the story.
    assert.ok(
      kinds({ ...PERFECT, currentVelocity: 0.25, tideCoefficient: 105 }).includes('springTide')
    );
  });

  it('still explains a mediocre window rather than showing nothing', () => {
    const poor: ScoreInputs = {
      ...PERFECT,
      tideCoefficient: 30,
      currentVelocity: 0.05,
      tidalRange: 1.2,
      hoursFromHighTide: 5.5,
      windSpeed: 55,
      windDirection: 90,
      windGusts: 80,
      waveHeight: 3.5,
      wavePeriod: 3,
      // Flat midday sun, so no twilight clears the threshold either.
      sun: { sunrise: NOW - 6 * HOUR, sunset: NOW + 6 * HOUR },
      cloudCover: 95,
      seaTemperature: 29,
      pressureTrend6h: -9,
    };
    const reasons = explainScore(computeScore(poor));
    assert.ok(reasons.length > 0, 'a window with no explanation is worse than a weak one');
    assert.ok(reasons.length <= MAX_REASONS);
    // Heavy cloud is the one thing going for it — and it is below the
    // threshold, so this only surfaces through the fallback.
    assert.ok(
      reasons.map((r) => r.kind).includes('overcast'),
      reasons.map((r) => r.kind).join(' ')
    );
    assert.ok(reasons.some((r) => r.value < REASON_THRESHOLD));
  });

  it('returns nothing rather than guessing when there is no data', () => {
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
    assert.deepEqual(explainScore(computeScore(empty)), []);
  });

  it('reports at most one reason per factor', () => {
    const reasons = explainScore(computeScore(PERFECT));
    const keys = reasons.map((r) => r.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.ok(FACTOR_ORDER.includes(key));
  });
});

describe('reason vocabulary', () => {
  /**
   * Completeness is enforced by the compiler: `STRINGS.reasons` is declared
   * `satisfies Record<ReasonKind, string>`, so adding a kind without a word is
   * a type error, not a runtime surprise. What is left to check is that the
   * words fit the design.
   */
  it('keeps every reason to a single word', () => {
    for (const [kind, word] of Object.entries(STRINGS.reasons)) {
      // "PLEINE MER" and "NORD-OUEST" are single terms; two unrelated words
      // would mean the reason is not specific enough.
      assert.ok(word.split(' ').length <= 2, `"${word}" (${kind}) is not one word`);
      assert.ok(word.length <= 12, `"${word}" (${kind}) is too long for the row`);
      assert.equal(word, word.toUpperCase(), `"${word}" (${kind}) is not uppercase`);
    }
  });

  it('gives every kind a distinct word', () => {
    const words = Object.values(STRINGS.reasons);
    assert.equal(new Set(words).size, words.length, 'two reasons share a word');
  });
});
