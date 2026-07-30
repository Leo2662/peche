import { REQUEST_TIMEOUT_MS } from '../config/env';

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export class NetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause?: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.url = url;
    this.cause = cause;
  }
}

export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return search ? `${base}?${search}` : base;
}

/** GET a JSON document with a hard timeout. Throws HttpError or NetworkError. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new HttpError(response.status, url);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new NetworkError(url, error);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
