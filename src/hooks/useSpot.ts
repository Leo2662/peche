import { useCallback, useEffect, useRef, useState } from 'react';

import type { Spot } from '../types';
import { DEFAULT_SPOT } from '../config/spots';
import { readSavedSpot, writeSavedSpot } from '../utils/cache';

export interface SpotState {
  spot: Spot;
  /** False until the saved spot has been read, to avoid a flash of the default. */
  ready: boolean;
  selectSpot: (spot: Spot) => void;
}

/**
 * The active fishing spot.
 *
 * Starts on Dunkerque, then restores whatever the user last chose. The choice
 * is persisted immediately so the app reopens where they left it.
 */
export function useSpot(): SpotState {
  const [spot, setSpot] = useState<Spot>(DEFAULT_SPOT);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      const saved = await readSavedSpot();
      if (!mounted.current) return;
      if (saved) setSpot(saved);
      setReady(true);
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  const selectSpot = useCallback((next: Spot) => {
    setSpot(next);
    void writeSavedSpot(next);
  }, []);

  return { spot, ready, selectSpot };
}
