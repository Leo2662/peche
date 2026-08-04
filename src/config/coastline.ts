/**
 * The French coastline, coarsely traced, split by fishing area.
 *
 * Two jobs:
 *  1. reject inland towns — searching "Lyon" must not offer a surfcasting spot;
 *  2. tell which sea a place is on, and therefore which stock assessment area
 *     it falls in.
 *
 * Deliberately coarse: ~10 km between vertices, following the open coast rather
 * than every ria and estuary. That is the right resolution for the question it
 * answers ("could you surfcast from this town?") and it keeps the data small
 * enough to ship in the bundle and to check with no network.
 *
 * Consequence worth knowing: because estuaries are cut across rather than
 * followed, a town well up a river — Bordeaux, Nantes, Rouen — measures far
 * from the line and is rejected, which is the wanted behaviour. A town on a
 * deep bay is kept by an explicit vertex.
 */

/** ICES divisions (Atlantic) and GFCM sub-areas (Mediterranean). */
export type FishingAreaId =
  | 'north-sea'
  | 'channel-east'
  | 'channel-west'
  | 'biscay-north'
  | 'biscay-south'
  | 'gulf-of-lion'
  | 'corsica';

export interface FishingArea {
  id: FishingAreaId;
  /** Shown to the user. */
  label: string;
  /** ICES division or GFCM sub-area code. */
  code: string;
  /**
   * Whether sea bass is a target species there, and the tide is worth scoring.
   * False for the Mediterranean: the fish is present, but the tidal range is a
   * few tens of centimetres and the tide-driven part of the index barely moves.
   */
  tidal: boolean;
}

export const FISHING_AREAS: Record<FishingAreaId, FishingArea> = {
  'north-sea': { id: 'north-sea', label: 'Mer du Nord', code: 'CIEM 4.c', tidal: true },
  'channel-east': { id: 'channel-east', label: 'Manche Est', code: 'CIEM 7.d', tidal: true },
  'channel-west': { id: 'channel-west', label: 'Manche Ouest', code: 'CIEM 7.e', tidal: true },
  'biscay-north': {
    id: 'biscay-north',
    label: 'Golfe de Gascogne Nord',
    code: 'CIEM 8.a',
    tidal: true,
  },
  'biscay-south': {
    id: 'biscay-south',
    label: 'Golfe de Gascogne Sud',
    code: 'CIEM 8.b',
    tidal: true,
  },
  'gulf-of-lion': { id: 'gulf-of-lion', label: 'Méditerranée', code: 'CGPM GSA 7', tidal: false },
  corsica: { id: 'corsica', label: 'Corse', code: 'CGPM GSA 8', tidal: false },
};

export interface CoastSegment {
  area: FishingAreaId;
  /** [latitude, longitude] pairs, following the coast. */
  points: ReadonlyArray<readonly [number, number]>;
}

/**
 * Where the ICES boundaries are drawn here: 4.c/7.d parts at the Dover Strait,
 * 7.d/7.e at the Cotentin, 7.e/8.a off southern Brittany, and 8.a/8.b at the
 * Gironde. Real ICES boundaries are meridians and parallels offshore; splitting
 * the coastline at the nearest headland is the shore-side equivalent and is
 * accurate to a few tens of kilometres.
 */
export const COASTLINE: readonly CoastSegment[] = [
  {
    area: 'north-sea',
    points: [
      [51.09, 2.55],
      [51.05, 2.37],
      [51.01, 2.12],
      [50.97, 1.85],
    ],
  },
  {
    area: 'channel-east',
    points: [
      [50.97, 1.85],
      [50.87, 1.58],
      [50.73, 1.6],
      [50.52, 1.58],
      [50.4, 1.56],
      [50.18, 1.5],
      [50.06, 1.37],
      [49.93, 1.08],
      [49.87, 0.9],
      [49.76, 0.37],
      [49.71, 0.2],
      [49.49, 0.11],
      [49.42, 0.23],
      [49.36, 0.07],
      [49.3, -0.1],
      [49.28, -0.25],
      [49.33, -0.45],
      [49.34, -0.62],
      [49.37, -0.85],
      [49.39, -1.04],
      [49.42, -1.18],
      [49.55, -1.24],
      [49.67, -1.26],
    ],
  },
  {
    area: 'channel-west',
    points: [
      [49.67, -1.26],
      [49.64, -1.62],
      [49.72, -1.94],
      [49.5, -1.86],
      [49.37, -1.79],
      [49.1, -1.6],
      [48.84, -1.6],
      [48.62, -1.51],
      [48.68, -1.85],
      [48.65, -2.02],
      [48.63, -2.2],
      [48.68, -2.32],
      [48.53, -2.76],
      [48.65, -2.9],
      [48.78, -3.05],
      [48.82, -3.44],
      [48.82, -3.51],
      [48.72, -3.9],
      [48.72, -4.0],
      [48.67, -4.32],
      [48.55, -4.6],
      [48.36, -4.77],
      [48.33, -4.78],
      [48.28, -4.6],
      [48.39, -4.49],
      [48.24, -4.55],
      [48.04, -4.74],
      [48.02, -4.54],
      [47.8, -4.37],
    ],
  },
  {
    area: 'biscay-north',
    points: [
      [47.8, -4.37],
      [47.87, -3.92],
      [47.72, -3.37],
      [47.58, -3.08],
      [47.48, -3.12],
      [47.55, -2.76],
      [47.5, -2.55],
      [47.35, -2.51],
      [47.29, -2.52],
      [47.27, -2.2],
      [47.11, -2.1],
      [46.98, -2.23],
      [46.79, -2.06],
      [46.5, -1.79],
      [46.34, -1.43],
      [46.24, -1.28],
      [46.16, -1.15],
      [45.99, -1.09],
      [45.8, -1.15],
      [45.62, -1.03],
      [45.57, -1.06],
    ],
  },
  {
    area: 'biscay-south',
    points: [
      [45.57, -1.06],
      [45.28, -1.14],
      [45.0, -1.2],
      [44.72, -1.24],
      [44.63, -1.25],
      [44.66, -1.17],
      [44.45, -1.25],
      [44.2, -1.3],
      [43.95, -1.37],
      [43.65, -1.45],
      [43.52, -1.53],
      [43.48, -1.56],
      [43.39, -1.66],
      [43.37, -1.78],
    ],
  },
  {
    area: 'gulf-of-lion',
    points: [
      [42.44, 3.17],
      [42.48, 3.13],
      [42.55, 3.05],
      [42.7, 3.03],
      [42.79, 3.04],
      [42.91, 3.05],
      [43.02, 3.06],
      [43.11, 3.11],
      [43.15, 3.15],
      [43.25, 3.29],
      [43.28, 3.5],
      [43.4, 3.69],
      [43.53, 3.93],
      [43.53, 4.13],
      [43.45, 4.43],
      [43.39, 4.8],
      [43.42, 4.87],
      [43.4, 5.05],
      [43.33, 5.2],
      [43.29, 5.37],
      [43.21, 5.54],
      [43.17, 5.61],
      [43.13, 5.75],
      [43.12, 5.93],
      [43.09, 6.15],
      [43.14, 6.37],
      [43.27, 6.64],
      [43.31, 6.64],
      [43.42, 6.74],
      [43.55, 7.02],
      [43.58, 7.13],
      [43.69, 7.27],
      [43.78, 7.53],
    ],
  },
  {
    area: 'corsica',
    points: [
      [42.96, 9.45],
      [42.7, 9.45],
      [42.4, 9.54],
      [42.1, 9.52],
      [41.85, 9.4],
      [41.59, 9.28],
      [41.39, 9.16],
      [41.55, 8.8],
      [41.68, 8.9],
      [41.87, 8.78],
      [41.92, 8.74],
      [42.14, 8.6],
      [42.35, 8.55],
      [42.57, 8.76],
      [42.63, 8.94],
      [42.81, 9.35],
      [42.96, 9.45],
    ],
  },
];

/**
 * How far inland a place may be and still count as a surfcasting town.
 *
 * Surfcasting is done from the beach, so the search is offering the *town* you
 * would drive to, not the exact stand. 20 km keeps a coastal town whose centre
 * sits a few kilometres back, and rejects everything genuinely inland.
 */
export const MAX_COAST_DISTANCE_KM = 20;
