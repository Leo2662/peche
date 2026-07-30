import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Forecast } from '../types';

const KEY_PREFIX = 'bassscore:forecast:v1:';

interface CacheEnvelope {
  version: 1;
  storedAt: number;
  forecast: Forecast;
}

/**
 * Last-known forecast, so a cold start with no signal still shows a score
 * instead of an error screen.
 */
export async function readCachedForecast(spotId: string): Promise<CacheEnvelope | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + spotId);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (parsed?.version !== 1 || !parsed.forecast) return null;
    return parsed;
  } catch (error) {
    console.warn('[cache] failed to read cached forecast:', error);
    return null;
  }
}

export async function writeCachedForecast(spotId: string, forecast: Forecast): Promise<void> {
  try {
    const envelope: CacheEnvelope = { version: 1, storedAt: Date.now(), forecast };
    await AsyncStorage.setItem(KEY_PREFIX + spotId, JSON.stringify(envelope));
  } catch (error) {
    console.warn('[cache] failed to persist forecast:', error);
  }
}
