/**
 * Visual identity: deep water.
 *
 * The whole chrome — backgrounds, chart fills, day pills, dividers, text —
 * lives in a stack of deep blues, and turquoise is the brand colour. That is
 * what makes the app feel like a marine instrument rather than a generic dark
 * theme.
 *
 * The three score accents still have to read as good / fair / poor at arm's
 * length, so they stay distinct in hue rather than being three shades of blue:
 * turquoise takes over from green at the top of the scale, and amber and coral
 * are pitched to sit on deep blue rather than on black.
 */

export const PALETTE = {
  /** Background stack, from the surface down. */
  surface: '#0C2438',
  deep: '#071726',
  abyss: '#030A12',
  /** Flat background for modal sheets, a shade above the abyss. */
  sheet: '#040D17',

  /** Brand. */
  turquoise: '#2FE0C8',
  /** Secondary brand tone, for chrome that must not compete with the score. */
  aqua: '#4FB6D9',

  amber: '#F5C63D',
  coral: '#F4677E',
  /** Muted blue-steel for anything with no state to report. */
  steel: '#6E93AE',
} as const;

export const ACCENTS = {
  excellent: PALETTE.turquoise,
  good: PALETTE.amber,
  poor: PALETTE.coral,
  neutral: PALETTE.steel,
} as const;

/** Bands are fixed by the design spec: 90–100, 70–90, below 70. */
export function accentForScore(score: number): string {
  if (score >= 90) return ACCENTS.excellent;
  if (score >= 70) return ACCENTS.good;
  return ACCENTS.poor;
}

/**
 * Background stack for the main screen: the accent bleeds into the surface at
 * the top and the screen sinks to near-black at the bottom, so the score sits
 * in the light and the chrome falls away below it.
 */
export function backgroundGradient(accent: string): [string, string, string] {
  // A constant wash of aqua goes in first, so the surface stays recognisably
  // water whatever the score is. Mixing the accent straight into the navy
  // turned an amber day olive, which read as a different app.
  const water = mix(PALETTE.surface, PALETTE.aqua, 0.14);
  return [mix(water, accent, 0.15), PALETTE.deep, PALETTE.abyss];
}

/** Blend `amount` (0–1) of `overlay` into `base`. */
export function mix(base: string, overlay: string, amount: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(overlay);
  const channel = (from: number, to: number) => Math.round(from + (to - from) * amount);
  return rgbToHex(channel(a.r, b.r), channel(a.g, b.g), channel(a.b, b.b));
}

/** Pull a colour down towards the abyss by `amount` (0 = abyss, 1 = untouched). */
export function tint(hex: string, amount: number): string {
  return mix(PALETTE.abyss, hex, amount);
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const value = parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  // Upper-case so a computed colour compares equal to a literal in PALETTE.
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * Text and dividers, all tinted towards the water rather than neutral grey —
 * pure white on deep blue reads as a different design system.
 */
export const COLORS = {
  /** Slightly cooled white: the score and anything that must be unmissable. */
  text: '#EAF6FA',
  textSecondary: 'rgba(184, 214, 232, 0.68)',
  textTertiary: 'rgba(150, 188, 212, 0.46)',
  /** Unfilled part of the score ring. */
  track: 'rgba(79, 182, 217, 0.12)',
  /** Hairlines between list rows. */
  divider: 'rgba(79, 182, 217, 0.14)',
  /** Resting and pressed fills for tappable chrome. */
  fill: 'rgba(79, 182, 217, 0.07)',
  fillPressed: 'rgba(79, 182, 217, 0.16)',
} as const;

export const TYPE = {
  score: 116,
  verdict: 13,
  windowValue: 30,
  label: 11,
  footer: 12,
} as const;
