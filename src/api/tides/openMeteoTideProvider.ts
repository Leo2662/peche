import type { TideData } from '../../types';
import { isNum } from '../../utils/math';
import { fetchSeaLevelSeries } from '../openMeteo';
import {
  coefficientFor,
  findTideExtrema,
  tidalRangeAt,
  type HeightPoint,
} from './tideMath';
import type { TideProvider, TideRequest } from './types';

/**
 * Default tide provider: derives high/low waters and the tidal coefficient from
 * Open-Meteo's `sea_level_height_msl` curve.
 *
 * Free, keyless and already part of the marine call we make anyway. Timings are
 * accurate to a few minutes; a station-grade source (SHOM, WorldTides) can be
 * dropped in via the registry when official predictions are required.
 */
export const openMeteoTideProvider: TideProvider = {
  id: 'open-meteo',
  label: 'Open-Meteo sea level',
  priority: 20,
  requiresApiKey: false,

  isConfigured() {
    return true;
  },

  async fetchTides({ spot, from, signal }: TideRequest): Promise<TideData> {
    const samples = await fetchSeaLevelSeries(spot, signal);

    const heights: HeightPoint[] = samples
      .filter((s) => isNum(s.seaLevel))
      .map((s) => ({ time: s.time, height: s.seaLevel as number }));

    if (heights.length < 3) {
      throw new Error('Open-Meteo returned no usable sea-level series for this location');
    }

    const events = findTideExtrema(heights);
    const range = tidalRangeAt(events, from);

    return {
      events,
      heights,
      range,
      coefficient: coefficientFor(spot, events, range),
      source: openMeteoTideProvider.id,
    };
  },
};
