import type { Verdict } from '../types';

/**
 * One accent colour drives the whole screen — ring, number and verdict — so the
 * result is legible at arm's length in under two seconds.
 *
 * Bands are fixed by the design spec: 90–100 green, 70–90 yellow, below 70 red.
 */
export const ACCENTS = {
  green: '#3DDC84',
  yellow: '#F6C445',
  red: '#FF5D5D',
  neutral: '#6E7A8A',
} as const;

export function accentForScore(score: number): string {
  if (score >= 90) return ACCENTS.green;
  if (score >= 70) return ACCENTS.yellow;
  return ACCENTS.red;
}

/** Deep, low-glare background tinted towards the accent. */
export function backgroundGradient(accent: string): [string, string, string] {
  return [tint(accent, 0.1), '#080B12', '#04060A'];
}

/** Mix a hex colour towards the dark background by `amount` (0–1). */
export function tint(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const base = { r: 6, g: 9, b: 15 };
  const mix = (channel: number, baseChannel: number) =>
    Math.round(baseChannel + (channel - baseChannel) * amount);
  return rgbToHex(mix(r, base.r), mix(g, base.g), mix(b, base.b));
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
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const COLORS = {
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.62)',
  textTertiary: 'rgba(255, 255, 255, 0.38)',
  track: 'rgba(255, 255, 255, 0.08)',
} as const;

export const TYPE = {
  score: 116,
  verdict: 13,
  windowValue: 30,
  label: 11,
  footer: 12,
} as const;

export const VERDICT_ACCENT: Record<Verdict, string> = {
  EXCELLENT: ACCENTS.green,
  GOOD: ACCENTS.yellow,
  AVERAGE: ACCENTS.red,
  POOR: ACCENTS.red,
};
