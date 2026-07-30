/**
 * Runtime configuration.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time, so these must be
 * referenced as full static property accesses (no destructuring, no dynamic
 * keys) or the replacement will not happen.
 *
 * The default stack needs **no API key at all** — see README.
 */

function readOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const ENV = {
  /** Optional: enables the WorldTides provider. */
  worldTidesApiKey: readOptional(process.env.EXPO_PUBLIC_WORLDTIDES_API_KEY),
  /**
   * Optional: force a tide provider id ("open-meteo" | "worldtides").
   * When unset the registry picks the highest-priority configured provider.
   */
  tideProvider: readOptional(process.env.EXPO_PUBLIC_TIDE_PROVIDER),
};

/** How often the app silently refetches while open. */
export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/** Network timeout for a single API call. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Forecast horizon used to search for the best fishing window. */
export const WINDOW_SEARCH_HOURS = 24;

/** Sampling resolution of the score timeline. */
export const TIMELINE_STEP_MINUTES = 10;
