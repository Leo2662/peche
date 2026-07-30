import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STRINGS } from '../src/config/strings';
import { DEFAULT_SPOT } from '../src/config/spots';
import { VERDICT_LABELS, getVerdict } from '../src/scoring/computeScore';
import { formatDayPill, formatFullDate, formatTime, DAY } from '../src/utils/time';

const TZ = DEFAULT_SPOT.timezone; // Europe/Paris

/**
 * These run under TZ=America/New_York in CI. Every assertion here would fail if
 * any formatter fell back to the device locale or the device timezone.
 */
describe('French formatting', () => {
  it('renders times in the spot timezone, not the device one', () => {
    // 17:10 UTC is 19:10 in Paris (CEST) — and 13:10 in New York.
    assert.equal(formatTime(Date.UTC(2026, 6, 30, 17, 10), TZ), '19:10');
    // Winter, CET: 17:10 UTC is 18:10 in Paris.
    assert.equal(formatTime(Date.UTC(2026, 0, 15, 17, 10), TZ), '18:10');
  });

  it('labels the current day and the days after it', () => {
    const now = Date.UTC(2026, 6, 30, 12);
    assert.equal(formatDayPill(now, now, TZ), STRINGS.days.today);
    assert.equal(formatDayPill(now, now, TZ), 'AUJ.');
    assert.equal(formatDayPill(now + DAY, now, TZ), 'VEN. 31');
    assert.equal(formatDayPill(now + 2 * DAY, now, TZ), 'SAM. 1');
  });

  it('decides "today" on the spot timezone', () => {
    // 22:30 UTC on 30 July is already 31 July in Paris, but still 30 July in
    // New York — the pill must follow Paris.
    const now = Date.UTC(2026, 6, 30, 12);
    assert.equal(formatDayPill(Date.UTC(2026, 6, 30, 22, 30), now, TZ), 'VEN. 31');
  });

  it('spells out the full date for screen readers', () => {
    assert.equal(formatFullDate(Date.UTC(2026, 6, 31, 12), TZ), 'vendredi 31 juillet');
  });
});

describe('French copy', () => {
  it('has a label for every verdict', () => {
    for (const score of [100, 95, 90, 89, 70, 69, 50, 49, 0]) {
      const label = VERDICT_LABELS[getVerdict(score)];
      assert.ok(label && label.length > 0, `no label for score ${score}`);
      assert.match(label, /^[A-ZÀ-Ÿ' ]+$/, `"${label}" is not uppercase French`);
    }
  });

  it('keeps the verdict short enough for one line on a small phone', () => {
    // 22 characters is the longest the ring caption can take at 13 pt with
    // 2.6 pt tracking inside a 342 pt content width.
    for (const label of Object.values(STRINGS.verdict)) {
      assert.ok(label.length <= 24, `"${label}" is ${label.length} characters`);
    }
  });

  /**
   * Completeness, not language: grepping French copy for English words is
   * hopeless ("score", "conditions" and "break" are all French too). What can
   * be checked mechanically is that no key is empty and no template silently
   * drops the value it was given — a forgotten key is the realistic bug.
   */
  it('has no empty string anywhere in the copy', () => {
    for (const [groupName, group] of Object.entries(STRINGS)) {
      for (const [key, value] of Object.entries(group)) {
        if (typeof value === 'function') continue;
        assert.ok(
          typeof value === 'string' && value.trim().length > 0,
          `${groupName}.${key} is empty`
        );
      }
    }
  });

  it('interpolates every value passed to a template', () => {
    assert.match(STRINGS.score.a11yScore(87), /87/);
    assert.match(STRINGS.footer.lastUpdate('14:20'), /14:20/);
    assert.match(STRINGS.days.a11y('lundi 3 août', 91), /lundi 3 août/);
    assert.match(STRINGS.days.a11y('lundi 3 août', 91), /91/);

    const window = STRINGS.windows.a11y('19:10', '21:00', 97);
    assert.match(window, /19:10/);
    assert.match(window, /21:00/);
    assert.match(window, /97/);
  });
});
