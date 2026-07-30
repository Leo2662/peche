import type { MarineSample, Spot, WeatherSample } from '../types';
import { parseUtcIso } from '../utils/time';
import { isNum } from '../utils/math';
import { buildUrl, getJson, HttpError } from './http';

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';

/** Open-Meteo reports ocean currents in km/h; the engine works in m/s. */
const KMH_TO_MS = 1 / 3.6;

interface HourlyEnvelope<T extends Record<string, unknown>> {
  hourly?: { time?: string[] } & T;
  error?: boolean;
  reason?: string;
}

type WeatherHourly = {
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  cloud_cover?: Array<number | null>;
  pressure_msl?: Array<number | null>;
  temperature_2m?: Array<number | null>;
};

type MarineHourly = {
  wave_height?: Array<number | null>;
  wave_period?: Array<number | null>;
  sea_surface_temperature?: Array<number | null>;
  sea_level_height_msl?: Array<number | null>;
  ocean_current_velocity?: Array<number | null>;
};

/** Column accessor that tolerates a missing variable entirely. */
function at(column: Array<number | null> | undefined, index: number): number | null {
  const value = column?.[index];
  return isNum(value) ? value : null;
}

/**
 * Hourly atmospheric forecast, including the previous day so the engine can
 * compute a 6-hour pressure trend for any instant in the window.
 */
export async function fetchWeather(spot: Spot, signal?: AbortSignal): Promise<WeatherSample[]> {
  const url = buildUrl(FORECAST_ENDPOINT, {
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly:
      'wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,temperature_2m',
    wind_speed_unit: 'kmh',
    // Always UTC: local wall-clock strings would be misread on a phone that is
    // not in the spot's timezone.
    timezone: 'UTC',
    past_days: 1,
    forecast_days: 3,
  });

  const data = await getJson<HourlyEnvelope<WeatherHourly>>(url, signal);
  const times = data.hourly?.time ?? [];
  const h = data.hourly;

  return times.map((time, i) => ({
    time: parseUtcIso(time),
    windSpeed: at(h?.wind_speed_10m, i) ?? 0,
    windDirection: at(h?.wind_direction_10m, i) ?? 0,
    windGusts: at(h?.wind_gusts_10m, i) ?? 0,
    cloudCover: at(h?.cloud_cover, i) ?? 0,
    pressure: at(h?.pressure_msl, i) ?? 1013,
    airTemperature: at(h?.temperature_2m, i),
  }));
}

const MARINE_CORE = ['wave_height', 'wave_period', 'sea_surface_temperature'];
const MARINE_OPTIONAL = ['sea_level_height_msl', 'ocean_current_velocity'];

function marineUrl(spot: Spot, variables: string[]): string {
  return buildUrl(MARINE_ENDPOINT, {
    latitude: spot.latitude,
    longitude: spot.longitude,
    hourly: variables.join(','),
    timezone: 'UTC',
    past_days: 1,
    forecast_days: 3,
  });
}

function toMarineSamples(data: HourlyEnvelope<MarineHourly>): MarineSample[] {
  const times = data.hourly?.time ?? [];
  const h = data.hourly;

  return times.map((time, i) => {
    const currentKmh = at(h?.ocean_current_velocity, i);
    return {
      time: parseUtcIso(time),
      waveHeight: at(h?.wave_height, i),
      wavePeriod: at(h?.wave_period, i),
      seaTemperature: at(h?.sea_surface_temperature, i),
      seaLevel: at(h?.sea_level_height_msl, i),
      currentVelocity: currentKmh === null ? null : currentKmh * KMH_TO_MS,
    };
  });
}

/**
 * Hourly sea state. Sea level and currents are not published for every model
 * or every grid cell; when the combined request is rejected we fall back to the
 * core variables so waves and sea temperature still reach the engine.
 */
export async function fetchMarine(spot: Spot, signal?: AbortSignal): Promise<MarineSample[]> {
  try {
    const data = await getJson<HourlyEnvelope<MarineHourly>>(
      marineUrl(spot, [...MARINE_CORE, ...MARINE_OPTIONAL]),
      signal
    );
    return toMarineSamples(data);
  } catch (error) {
    // 400 = "cannot initialize variable"; anything else is a real failure.
    if (!(error instanceof HttpError) || error.status !== 400) throw error;
    const data = await getJson<HourlyEnvelope<MarineHourly>>(marineUrl(spot, MARINE_CORE), signal);
    return toMarineSamples(data);
  }
}

/** Exposed for the Open-Meteo tide provider, which needs the raw sea-level curve. */
export async function fetchSeaLevelSeries(
  spot: Spot,
  signal?: AbortSignal
): Promise<MarineSample[]> {
  const data = await getJson<HourlyEnvelope<MarineHourly>>(
    marineUrl(spot, ['sea_level_height_msl', 'ocean_current_velocity']),
    signal
  );
  return toMarineSamples(data);
}
