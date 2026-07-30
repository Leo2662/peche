import type { Forecast, Spot } from '../types';
import { WINDOW_SEARCH_HOURS } from '../config/env';
import { buildForecast } from '../scoring/forecast';
import { HOUR } from '../utils/time';
import { fetchMarine, fetchWeather } from './openMeteo';
import { fetchTides } from './tides';

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
      // Reach back far enough to bracket the tidal cycle we are inside.
      from: now - 12 * HOUR,
      to: now + (WINDOW_SEARCH_HOURS + 12) * HOUR,
      signal,
    }),
  ]);

  if (weather.length === 0) {
    throw new Error('Weather provider returned an empty forecast');
  }

  return buildForecast({ spot, weather, marine, tide }, now);
}
