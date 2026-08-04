import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACCENTS,
  accentForScore,
  backgroundGradient,
  COLORS,
  mix,
  PALETTE,
  tint,
  withAlpha,
} from '../src/utils/theme';
import { getVerdict } from '../src/scoring/computeScore';

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

describe('accent bands', () => {
  it('matches the verdict thresholds exactly', () => {
    assert.equal(accentForScore(100), ACCENTS.excellent);
    assert.equal(accentForScore(90), ACCENTS.excellent);
    assert.equal(accentForScore(89), ACCENTS.good);
    assert.equal(accentForScore(70), ACCENTS.good);
    assert.equal(accentForScore(69), ACCENTS.poor);
    assert.equal(accentForScore(0), ACCENTS.poor);

    // The colour and the wording must never disagree.
    for (const score of [100, 95, 90, 89, 80, 70, 69, 50, 20, 0]) {
      const verdict = getVerdict(score);
      const expected =
        verdict === 'EXCELLENT'
          ? ACCENTS.excellent
          : verdict === 'GOOD'
            ? ACCENTS.good
            : ACCENTS.poor;
      assert.equal(accentForScore(score), expected, `score ${score}`);
    }
  });

  /**
   * The identity is deep blue and turquoise, but the three bands still have to
   * be told apart at a glance — they must be three colour families (turquoise,
   * gold, red-pink), not three shades of the same blue.
   *
   * 45° is the bar: it comfortably separates those three, and would reject two
   * neighbouring blues, which is the failure mode this guards against.
   */
  it('keeps the three bands in distinct colour families', () => {
    const hues = [ACCENTS.excellent, ACCENTS.good, ACCENTS.poor].map(hue);
    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        const gap = Math.abs(((hues[i] - hues[j] + 540) % 360) - 180);
        assert.ok(gap >= 45, `hues ${hues[i].toFixed(0)} and ${hues[j].toFixed(0)} are too close`);
      }
    }
  });

  it('puts the brand turquoise at the top of the scale', () => {
    assert.equal(ACCENTS.excellent, PALETTE.turquoise);
    const h = hue(PALETTE.turquoise);
    assert.ok(h > 150 && h < 200, `turquoise hue is ${h.toFixed(0)}`);
  });
});

describe('legibility on deep water', () => {
  it('reads every accent against the darkest background', () => {
    for (const [name, accent] of Object.entries(ACCENTS)) {
      const ratio = contrast(accent, PALETTE.abyss);
      assert.ok(ratio >= 4.5, `${name} is ${ratio.toFixed(1)}:1 on the abyss`);
    }
  });

  it('reads every accent against the lit surface at the top of the screen', () => {
    for (const [name, accent] of Object.entries(ACCENTS)) {
      const ratio = contrast(accent, PALETTE.surface);
      assert.ok(ratio >= 3, `${name} is ${ratio.toFixed(1)}:1 on the surface`);
    }
  });

  it('keeps the primary text well clear of the background', () => {
    assert.ok(contrast(COLORS.text, PALETTE.abyss) >= 7);
    assert.ok(contrast(COLORS.text, PALETTE.surface) >= 7);
    assert.ok(contrast(COLORS.text, PALETTE.sheet) >= 7);
  });
});

describe('background stack', () => {
  it('sinks from the lit surface to the abyss', () => {
    const [top, middle, bottom] = backgroundGradient(ACCENTS.excellent);
    assert.ok(luminance(top) > luminance(middle), 'the surface must be the lightest');
    assert.ok(luminance(middle) > luminance(bottom), 'the screen must sink');
    assert.equal(bottom, PALETTE.abyss);
  });

  it('carries the accent into the surface without swamping it', () => {
    const warm = backgroundGradient(ACCENTS.poor)[0];
    const cool = backgroundGradient(ACCENTS.excellent)[0];
    assert.notEqual(warm, cool);
    // Still a deep blue, not a wash of the accent.
    assert.ok(contrast(COLORS.text, warm) >= 7, 'the tinted surface stayed dark enough');
    assert.ok(contrast(COLORS.text, cool) >= 7);
  });
});

describe('colour helpers', () => {
  it('mixes between two colours, normalising the case', () => {
    assert.equal(mix('#000000', '#ffffff', 0), '#000000');
    assert.equal(mix('#000000', '#ffffff', 1), '#FFFFFF');
    assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  });

  it('pulls a colour towards the abyss', () => {
    assert.equal(tint(ACCENTS.excellent, 1), ACCENTS.excellent);
    assert.equal(tint(ACCENTS.excellent, 0), PALETTE.abyss);
    assert.ok(luminance(tint(ACCENTS.excellent, 0.3)) < luminance(ACCENTS.excellent));
  });

  it('produces valid rgba and expands shorthand hex', () => {
    assert.equal(withAlpha('#2FE0C8', 0.5), 'rgba(47, 224, 200, 0.5)');
    assert.equal(withAlpha('#fff', 1), 'rgba(255, 255, 255, 1)');
  });
});
