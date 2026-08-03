import type { Spot } from '../types';
import { buildUrl, getJson } from './http';

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

/** Only French places are offered — the index is built for one country. */
const COUNTRY_CODE = 'FR';

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  /** Region, e.g. "Hauts-de-France". */
  admin1?: string;
  /** Department, e.g. "Nord". */
  admin2?: string;
  timezone?: string;
  population?: number;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
  error?: boolean;
  reason?: string;
}

/** A searchable place, before it becomes the active spot. */
export interface PlaceSuggestion {
  spot: Spot;
  /** Region and department, for telling two same-named villages apart. */
  context: string;
}

/** Shortest query worth sending. */
export const MIN_QUERY_LENGTH = 2;

function toSpot(result: GeocodingResult): Spot {
  return {
    // Namespaced so a searched place can never collide with a built-in slug.
    id: `geo:${result.id}`,
    name: result.name,
    label: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    // Everywhere in metropolitan France is Europe/Paris; the API value wins
    // when present so overseas départements still render correctly.
    timezone: result.timezone ?? 'Europe/Paris',
    // No tidal constants and no wind table: this spot is not calibrated. Both
    // are handled downstream — see `withTidalScale` and `windFactor`.
  };
}

function contextOf(result: GeocodingResult): string {
  return [result.admin2, result.admin1].filter(Boolean).join(' · ');
}

/**
 * Search French places by name.
 *
 * Uses Open-Meteo's geocoding index: free, keyless, and the same provider the
 * forecast comes from, so a place that can be found can always be scored.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const url = buildUrl(ENDPOINT, {
    name: trimmed,
    count: 12,
    language: 'fr',
    countryCode: COUNTRY_CODE,
    format: 'json',
  });

  const data = await getJson<GeocodingResponse>(url, signal);
  if (data.error) throw new Error(data.reason ?? 'Geocoding request failed');

  return (data.results ?? [])
    // `countryCode` is a filter, not a guarantee — check it.
    .filter((result) => (result.country_code ?? COUNTRY_CODE) === COUNTRY_CODE)
    .map((result) => ({ spot: toSpot(result), context: contextOf(result) }));
}
