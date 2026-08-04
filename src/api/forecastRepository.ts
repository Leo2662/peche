import type { Forecast, MarineSample, Spot, TideData } from '../types';
import { FORECAST_DAYS } from '../config/env';
import { buildForecast } from '../scoring/forecast';
import { isNum } from '../utils/math';
import { DAY, HOUR } from '../utils/time';
import { fetchMarine, fetchWeather } from './openMeteo';
import { fetchTides } from './tides';
import { withTidalScale } from './tides/tideMath';

/**
 * The spot is on the coast but the marine model has nothing there.
 *
 * Distinct from a network failure: retrying will not help, and the user needs
 * to be told to pick somewhere else rather than to check their connection.
 */
export class NoMarineDataError extends Error {
  readonly spot: Spot;

  constructor(spot: Spot) {
    super(`No marine coverage at ${spot.name} (${spot.latitude}, ${spot.longitude})`);
    this.name = 'NoMarineDataError';
    this.spot = spot;
  }
}

/**
 * True when the sea state is usable: waves, or failing that a sea-level curve.
 *
 * Either one alone is enough to score a spot honestly — sea level drives the
 * tide factors, waves drive the surf. With neither, more than half the index
 * would be a neutral guess.
 */
function hasMarineCoverage(marine: MarineSample[], tide: TideData): boolean {
  const hasWaves = marine.some((sample) => isNum(sample.waveHeight));
  const hasSeaLevel = marine.some((sample) => isNum(sample.seaLevel)) || tide.events.length > 0;
  return hasWaves || hasSeaLevel;
}

/**
 * Single entry point for "give me the current forecast".
 *
 * Weather, sea state and tides are fetched concurrently — they are independent
 * endpoints and the app's whole promise is that the score is up in about a
 * second.
 */
export async function loadForecast(spot: Spot, signal?: AbortSignal): Promise<Forecast> {
  const now = Date.now();

  const [weather, marine, tide] = await Promise.all([
    fetchWeather(spot, signal),
    fetchMarine(spot, signal),
    fetchTides({
      spot,
      // Reach back far enough to bracket the tidal cycle we are inside, and
      // forward past the last selectable day so its evening tide is covered.
      from: now - 12 * HOUR,
      to: now + FORECAST_DAYS * DAY + 12 * HOUR,
      signal,
    }),
  ]);

  if (weather.length === 0) {
    throw new Error('Weather provider returned an empty forecast');
  }

  // The coastline check runs on device before a spot can be chosen, but it only
  // answers "is this on the coast". Whether the marine model actually covers
  // the point is a different question, and only the model can answer it — an
  // enclosed bay or a lagoon can be on the coast and still have no sea state.
  if (!hasMarineCoverage(marine, tide)) {
    throw new NoMarineDataError(spot);
  }

  // A searched spot carries no tidal constants; estimate them from the curve we
  // just fetched, so the engine has a local reference instead of Dunkerque's.
  return buildForecast({ spot: withTidalScale(spot, tide.events), weather, marine, tide }, now);
}
