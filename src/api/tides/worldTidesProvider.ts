import type { TideData, TideEvent } from '../../types';
import { ENV } from '../../config/env';
import { isNum } from '../../utils/math';
import { buildUrl, getJson } from '../http';
import { coefficientFromRange, tidalRangeAt, type HeightPoint } from './tideMath';
import type { TideProvider, TideRequest } from './types';

const ENDPOINT = 'https://www.worldtides.info/api/v3';

interface WorldTidesResponse {
  status: number;
  error?: string;
  extremes?: Array<{ dt: number; date: string; height: number; type: 'High' | 'Low' }>;
  heights?: Array<{ dt: number; height: number }>;
}

/**
 * Optional station-grade provider. Enabled by setting
 * `EXPO_PUBLIC_WORLDTIDES_API_KEY`; when the key is absent the registry falls
 * straight through to the keyless Open-Meteo provider.
 */
export const worldTidesProvider: TideProvider = {
  id: 'worldtides',
  label: 'WorldTides',
  priority: 10,
  requiresApiKey: true,

  isConfigured() {
    return ENV.worldTidesApiKey !== null;
  },

  async fetchTides({ spot, from, to, signal }: TideRequest): Promise<TideData> {
    const key = ENV.worldTidesApiKey;
    if (!key) throw new Error('WorldTides API key is not configured');

    const url = buildUrl(ENDPOINT, {
      extremes: '',
      heights: '',
      lat: spot.latitude,
      lon: spot.longitude,
      start: Math.floor(from / 1000),
      length: Math.max(3600, Math.ceil((to - from) / 1000)),
      step: 1800,
      datum: 'MSL',
      key,
    });

    const data = await getJson<WorldTidesResponse>(url, signal);
    if (data.status !== 200) {
      throw new Error(data.error ?? `WorldTides responded with status ${data.status}`);
    }

    const events: TideEvent[] = (data.extremes ?? []).map((extreme) => ({
      type: extreme.type === 'High' ? 'high' : 'low',
      time: extreme.dt * 1000,
      height: extreme.height,
    }));

    const heights: HeightPoint[] = (data.heights ?? [])
      .filter((point) => isNum(point.height))
      .map((point) => ({ time: point.dt * 1000, height: point.height }));

    const range = tidalRangeAt(events, from);

    return {
      events,
      heights,
      range,
      coefficient: range === null ? null : coefficientFromRange(range, spot),
      source: worldTidesProvider.id,
    };
  },
};
