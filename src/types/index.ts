/**
 * Shared domain types for BassScore.
 *
 * Everything the scoring engine consumes is expressed here in normalised SI-ish
 * units so that swapping a data provider never leaks provider-specific shapes
 * into `src/scoring`.
 *
 * Units used across the app:
 *  - wind speed / gusts : km/h
 *  - directions         : degrees, meteorological (0 = from North, 90 = from East)
 *  - current velocity   : m/s
 *  - heights / ranges   : metres
 *  - wave period        : seconds
 *  - temperature        : °C
 *  - pressure           : hPa
 */

export interface Spot {
  /** Stable identifier — future-ready for a multi-spot picker. */
  id: string;
  /** Full display name. */
  name: string;
  /** Short label shown under the score. */
  label: string;
  latitude: number;
  longitude: number;
  /** IANA timezone used to render local times. */
  timezone: string;
  /**
   * "Unité de hauteur" of the harbour (SHOM). Half of the mean spring tidal
   * range, used to derive the French tidal coefficient from a tidal range.
   */
  tidalUnitHeight: number;
  /** Mean spring tidal range, used to normalise the tidal-range sub-score. */
  meanSpringRange: number;
}

/** Atmospheric conditions at one instant. */
export interface WeatherSample {
  time: number;
  /** km/h */
  windSpeed: number;
  /** degrees, direction the wind blows *from* */
  windDirection: number;
  /** km/h */
  windGusts: number;
  /** % */
  cloudCover: number;
  /** hPa, mean-sea-level pressure */
  pressure: number;
  /** °C, air temperature (informational) */
  airTemperature: number | null;
}

/** Sea state at one instant. */
export interface MarineSample {
  time: number;
  /** metres */
  waveHeight: number | null;
  /** seconds */
  wavePeriod: number | null;
  /** °C */
  seaTemperature: number | null;
  /** metres above MSL — the tide curve */
  seaLevel: number | null;
  /** m/s */
  currentVelocity: number | null;
}

export type TideEventType = 'high' | 'low';

export interface TideEvent {
  type: TideEventType;
  time: number;
  /** metres, provider datum */
  height: number;
}

/** Normalised tide payload every provider must return. */
export interface TideData {
  events: TideEvent[];
  /** Optional raw height curve, when the provider exposes one. */
  heights: Array<{ time: number; height: number }>;
  /** French tidal coefficient (20–120), or null when unknown. */
  coefficient: number | null;
  /** Tidal range of the cycle around "now", in metres. */
  range: number | null;
  /** Provider id that produced this payload. */
  source: string;
}

export interface SunTimes {
  sunrise: number;
  sunset: number;
}

export interface MoonInfo {
  /** 0 = new moon, 0.5 = full moon, 1 = new moon again. */
  phase: number;
  /** 0–1 illuminated fraction. */
  illumination: number;
  /** Human label, e.g. "Waxing gibbous". */
  label: string;
}

/**
 * Everything needed to score one instant. The engine is pure: give it this and
 * it returns a score, with no I/O and no clock access.
 */
export interface ScoreInputs {
  time: number;
  spot: Spot;
  tideCoefficient: number | null;
  currentVelocity: number | null;
  tidalRange: number | null;
  /** Signed hours relative to the nearest high tide (negative = before). */
  hoursFromHighTide: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGusts: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  cloudCover: number | null;
  sun: SunTimes | null;
  seaTemperature: number | null;
  /** Signed pressure change over the previous 6 hours, in hPa. */
  pressureTrend6h: number | null;
}

export type FactorKey =
  | 'biologicalActivity'
  | 'tideWindow'
  | 'wind'
  | 'waves'
  | 'light'
  | 'waterTemperature'
  | 'pressure';

/** A single 0–1 factor plus the reasoning behind it. */
export interface FactorResult {
  key: FactorKey;
  /** 0–1 */
  value: number;
  /** Weight applied in the final blend. */
  weight: number;
  /** Sub-scores, for debugging and for the future "why?" screen. */
  detail: Record<string, number | null>;
  /** True when inputs were missing and a neutral default was substituted. */
  estimated: boolean;
}

export interface ScoreResult {
  time: number;
  /** 0–100, rounded. */
  score: number;
  factors: Record<FactorKey, FactorResult>;
  /** True when at least one factor fell back to a neutral default. */
  partial: boolean;
}

export type Verdict = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';

export interface BestWindow {
  start: number;
  end: number;
  /** Peak score reached inside the window. */
  peakScore: number;
}

/** One selectable day, with the fishing windows it contains. */
export interface DayForecast {
  /** "2026-07-30" in the spot's timezone — the day selector's identity. */
  key: string;
  /** First and last timeline sample that fall on this day. */
  start: number;
  end: number;
  /** Best score reached during the covered part of the day. */
  peakScore: number;
  /**
   * Windows worth fishing, in chronological order. Empty when nothing on this
   * day clears the threshold — for today, also empty once they have passed.
   */
  windows: BestWindow[];
  /** False for today, whose earlier hours are already behind us. */
  complete: boolean;
}

/** The complete payload the UI renders. */
export interface Forecast {
  spot: Spot;
  generatedAt: number;
  now: ScoreResult;
  /** Selectable days, starting with today. */
  days: DayForecast[];
  moon: MoonInfo;
  tide: {
    coefficient: number | null;
    range: number | null;
    nextHigh: TideEvent | null;
    nextLow: TideEvent | null;
    source: string;
  };
  /** 10-minute-resolution score timeline the days were derived from. */
  timeline: Array<{ time: number; score: number }>;
}

export type ForecastStatus = 'idle' | 'loading' | 'ready' | 'error';
