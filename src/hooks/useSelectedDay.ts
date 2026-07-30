import { useCallback, useMemo, useState } from 'react';

import type { DayForecast } from '../types';

export interface SelectedDay {
  selectedKey: string | null;
  selectedDay: DayForecast | null;
  selectDay: (key: string) => void;
  isFirstDay: boolean;
}

/**
 * Which day the user is looking at.
 *
 * The selection is held as a day *key* rather than an index, so a background
 * refresh that rolls midnight over — dropping today and shifting every index —
 * keeps the user on the date they chose instead of silently jumping a day. If
 * the chosen day falls out of the forecast entirely, it falls back to the
 * first available one.
 */
export function useSelectedDay(days: DayForecast[]): SelectedDay {
  const [requestedKey, setRequestedKey] = useState<string | null>(null);

  const selectedKey = useMemo(() => {
    if (requestedKey && days.some((day) => day.key === requestedKey)) return requestedKey;
    return days[0]?.key ?? null;
  }, [requestedKey, days]);

  const selectedDay = useMemo(
    () => days.find((day) => day.key === selectedKey) ?? null,
    [days, selectedKey]
  );

  const selectDay = useCallback((key: string) => setRequestedKey(key), []);

  return {
    selectedKey,
    selectedDay,
    selectDay,
    isFirstDay: selectedKey !== null && selectedKey === days[0]?.key,
  };
}
