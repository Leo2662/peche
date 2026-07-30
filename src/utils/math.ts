/** Small numeric helpers shared by the scoring engine. */

export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation. `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp, clamped to 0–1. Returns 0 when the range is degenerate. */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min));
}

/** True when `value` is a usable, finite number. */
export function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Shortest signed angular difference between two bearings, in degrees. */
export function angleDelta(a: number, b: number): number {
  const diff = ((a - b + 540) % 360) - 180;
  return diff;
}

/**
 * Vertex of the parabola through three equally spaced samples.
 * Returns the offset of the extremum from `y1`, in samples, within [-1, 1].
 * Used to refine hourly tide extrema to sub-hour precision.
 */
export function parabolicVertexOffset(y0: number, y1: number, y2: number): number {
  const denom = y0 - 2 * y1 + y2;
  if (denom === 0) return 0;
  return clamp((0.5 * (y0 - y2)) / denom, -1, 1);
}

/** Mean of the finite values in an array; null when there are none. */
export function mean(values: Array<number | null | undefined>): number | null {
  const usable = values.filter(isNum);
  if (usable.length === 0) return null;
  return usable.reduce((sum, v) => sum + v, 0) / usable.length;
}
