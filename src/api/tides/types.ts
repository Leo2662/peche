import type { Spot, TideData } from '../../types';

export interface TideRequest {
  spot: Spot;
  /** Window of interest; providers may return more. */
  from: number;
  to: number;
  signal?: AbortSignal;
}

/**
 * Every tide source implements this. The registry in `./index.ts` picks one at
 * runtime, so swapping SHOM / WorldTides / Stormglass for the built-in
 * Open-Meteo derivation is a one-line change and never touches the engine.
 */
export interface TideProvider {
  readonly id: string;
  readonly label: string;
  /** Lower number = tried first. */
  readonly priority: number;
  /** False for the keyless default provider. */
  readonly requiresApiKey: boolean;
  /** True when the provider has everything it needs to run. */
  isConfigured(): boolean;
  fetchTides(request: TideRequest): Promise<TideData>;
}
