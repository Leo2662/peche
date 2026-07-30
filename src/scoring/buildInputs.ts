import type { MarineSample, ScoreInputs, Spot, TideData, WeatherSample } from '../types';
import { getSunTimes } from '../utils/moon';
import { sampleSeries, hasField } from '../utils/series';
import { HOUR } from '../utils/time';
import {
  estimateCurrentFromCurve,
  hoursFromHighTide,
  tidalRangeAt,
} from '../api/tides/tideMath';

export interface RawConditions {
  spot: Spot;
  weather: WeatherSample[];
  marine: MarineSample[];
  tide: TideData;
}

/**
 * Assemble the pure `ScoreInputs` for one instant from the raw API series.
 *
 * This is the only place that knows how the providers' shapes map onto the
 * engine's vocabulary, which keeps `src/scoring/factors` free of I/O concerns.
 */
export function buildInputs(raw: RawConditions, time: number): ScoreInputs {
  const { spot, weather, marine, tide } = raw;

  const pressure = sampleSeries(weather, time, (s) => s.pressure);
  const pressure6hAgo = sampleSeries(weather, time - 6 * HOUR, (s) => s.pressure);
  const pressureTrend6h =
    pressure !== null && pressure6hAgo !== null ? pressure - pressure6hAgo : null;

  // Prefer the model's own current field; fall back to the slope of the tide
  // curve when the marine model does not publish currents for this cell.
  const modelledCurrent = hasField(marine, (s) => s.currentVelocity)
    ? sampleSeries(marine, time, (s) => s.currentVelocity)
    : null;
  const currentVelocity =
    modelledCurrent ?? estimateCurrentFromCurve(tide.heights, time);

  const range = tidalRangeAt(tide.events, time) ?? tide.range;

  return {
    time,
    spot,
    tideCoefficient: tide.coefficient,
    currentVelocity,
    tidalRange: range,
    hoursFromHighTide: hoursFromHighTide(tide.events, time),
    windSpeed: sampleSeries(weather, time, (s) => s.windSpeed),
    windDirection: sampleDirection(weather, time),
    windGusts: sampleSeries(weather, time, (s) => s.windGusts),
    waveHeight: sampleSeries(marine, time, (s) => s.waveHeight),
    wavePeriod: sampleSeries(marine, time, (s) => s.wavePeriod),
    cloudCover: sampleSeries(weather, time, (s) => s.cloudCover),
    sun: getSunTimes(time, spot.latitude, spot.longitude),
    seaTemperature: sampleSeries(marine, time, (s) => s.seaTemperature),
    pressureTrend6h,
  };
}

/**
 * Bearings must be interpolated as vectors — a naive average of 350° and 10°
 * gives 180°, i.e. the exact opposite of the true 0°.
 */
function sampleDirection(weather: WeatherSample[], time: number): number | null {
  const sin = sampleSeries(weather, time, (s) =>
    Number.isFinite(s.windDirection) ? Math.sin((s.windDirection * Math.PI) / 180) : null
  );
  const cos = sampleSeries(weather, time, (s) =>
    Number.isFinite(s.windDirection) ? Math.cos((s.windDirection * Math.PI) / 180) : null
  );
  if (sin === null || cos === null) return null;
  if (sin === 0 && cos === 0) return null;

  const degrees = (Math.atan2(sin, cos) * 180) / Math.PI;
  return (degrees + 360) % 360;
}
