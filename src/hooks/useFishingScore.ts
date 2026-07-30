import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { Forecast, ForecastStatus, Spot } from '../types';
import { loadForecast } from '../api/forecastRepository';
import { REFRESH_INTERVAL_MS } from '../config/env';
import { STRINGS } from '../config/strings';
import { readCachedForecast, writeCachedForecast } from '../utils/cache';

export interface FishingScoreState {
  status: ForecastStatus;
  forecast: Forecast | null;
  /** True when the forecast on screen came from cache and not from the network. */
  isStale: boolean;
  error: string | null;
  lastUpdated: number | null;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Map a failure onto copy the angler can act on.
 *
 * Exception messages are developer-facing — they name endpoints and providers,
 * and they are in English. They belong in the console, not on the screen, so
 * only the network case gets its own wording and everything else is generic.
 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.name === 'NetworkError') return STRINGS.error.network;
  console.warn('[forecast] load failed:', error);
  return STRINGS.error.generic;
}

/**
 * Owns the whole data lifecycle for the score screen:
 * cached score first, then network, then a silent refresh every 30 minutes and
 * whenever the app comes back to the foreground stale.
 */
export function useFishingScore(spot: Spot): FishingScoreState {
  const [status, setStatus] = useState<ForecastStatus>('loading');
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  const lastFetchAt = useRef(0);

  const fetchNow = useCallback(
    async (options: { isRefresh?: boolean } = {}) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      if (options.isRefresh) setRefreshing(true);

      try {
        const next = await loadForecast(spot, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;

        lastFetchAt.current = Date.now();
        setForecast(next);
        setIsStale(false);
        setError(null);
        setLastUpdated(next.generatedAt);
        setStatus('ready');
        void writeCachedForecast(spot.id, next);
      } catch (err) {
        if (!mounted.current || controller.signal.aborted) return;

        setError(describeError(err));
        // Offline behaviour: keep showing the last known score, flagged stale.
        setStatus((current) => {
          if (current === 'ready') {
            setIsStale(true);
            return 'ready';
          }
          return 'error';
        });
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [spot]
  );

  // Cache first, network second.
  useEffect(() => {
    mounted.current = true;

    (async () => {
      const cached = await readCachedForecast(spot.id);
      if (mounted.current && cached) {
        setForecast(cached.forecast);
        setLastUpdated(cached.forecast.generatedAt);
        setIsStale(true);
        setStatus('ready');
      }
      await fetchNow();
    })();

    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, [spot.id, fetchNow]);

  // Silent refresh every 30 minutes while the app is open.
  useEffect(() => {
    const timer = setInterval(() => void fetchNow(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNow]);

  // And once more when the user comes back to a stale app.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (Date.now() - lastFetchAt.current < REFRESH_INTERVAL_MS) return;
      void fetchNow();
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [fetchNow]);

  const refresh = useCallback(() => void fetchNow({ isRefresh: true }), [fetchNow]);

  return { status, forecast, isStale, error, lastUpdated, refreshing, refresh };
}
