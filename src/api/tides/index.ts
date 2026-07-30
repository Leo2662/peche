import type { TideData } from '../../types';
import { ENV } from '../../config/env';
import { openMeteoTideProvider } from './openMeteoTideProvider';
import { worldTidesProvider } from './worldTidesProvider';
import type { TideProvider, TideRequest } from './types';

export type { TideProvider, TideRequest } from './types';
export * from './tideMath';

/** All known providers, best-first. */
export const TIDE_PROVIDERS: TideProvider[] = [worldTidesProvider, openMeteoTideProvider].sort(
  (a, b) => a.priority - b.priority
);

/**
 * Providers that can actually run, honouring an explicit
 * `EXPO_PUBLIC_TIDE_PROVIDER` override when one is set.
 */
export function resolveProviders(): TideProvider[] {
  const configured = TIDE_PROVIDERS.filter((provider) => provider.isConfigured());

  if (ENV.tideProvider) {
    const forced = configured.filter((provider) => provider.id === ENV.tideProvider);
    if (forced.length > 0) return forced;
    // An unknown or unconfigured id must not silently disable tides.
    console.warn(
      `[tides] EXPO_PUBLIC_TIDE_PROVIDER="${ENV.tideProvider}" is not available; falling back.`
    );
  }

  return configured;
}

/** Try each available provider in order; the last error propagates. */
export async function fetchTides(request: TideRequest): Promise<TideData> {
  const providers = resolveProviders();
  if (providers.length === 0) throw new Error('No tide provider is configured');

  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await provider.fetchTides(request);
    } catch (error) {
      lastError = error;
      console.warn(`[tides] provider "${provider.id}" failed:`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All tide providers failed');
}
