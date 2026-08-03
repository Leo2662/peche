import { useCallback, useEffect, useRef, useState } from 'react';

import { MIN_QUERY_LENGTH, searchPlaces, type PlaceSuggestion } from '../api/geocoding';
import { STRINGS } from '../config/strings';

export interface PlaceSearchState {
  query: string;
  setQuery: (value: string) => void;
  results: PlaceSuggestion[];
  searching: boolean;
  error: string | null;
  reset: () => void;
}

/** Keystrokes settle before a request goes out. */
const DEBOUNCE_MS = 300;

/**
 * Debounced place search.
 *
 * Every new query aborts the one in flight, so results can never arrive out of
 * order and paint an older answer over a newer one.
 */
export function usePlaceSearch(): PlaceSearchState {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      inFlight.current?.abort();
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const found = await searchPlaces(trimmed, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setResults(found);
      } catch (err) {
        if (!mounted.current || controller.signal.aborted) return;
        console.warn('[geocoding] search failed:', err);
        setResults([]);
        setError(STRINGS.spotPicker.error);
      } finally {
        if (mounted.current && !controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    setQuery('');
    setResults([]);
    setSearching(false);
    setError(null);
  }, []);

  return { query, setQuery, results, searching, error, reset };
}
