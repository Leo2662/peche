import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { MIN_QUERY_LENGTH, searchPlaces } from '../src/api/geocoding';

const realFetch = globalThis.fetch;

/** Stand in for the geocoding endpoint, capturing the URL it was called with. */
function stubFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const DUNKERQUE = {
  id: 2998324,
  name: 'Dunkerque',
  latitude: 51.03297,
  longitude: 2.37708,
  country_code: 'FR',
  admin1: 'Hauts-de-France',
  admin2: 'Nord',
  timezone: 'Europe/Paris',
};

describe('searchPlaces', () => {
  it('maps a result onto an uncalibrated spot', async () => {
    stubFetch({ results: [DUNKERQUE] });

    const [suggestion] = await searchPlaces('Dunkerque');
    assert.equal(suggestion.spot.name, 'Dunkerque');
    assert.equal(suggestion.spot.latitude, 51.03297);
    assert.equal(suggestion.spot.timezone, 'Europe/Paris');
    assert.equal(suggestion.context, 'Nord · Hauts-de-France');

    // Namespaced, so it can never collide with the built-in slug.
    assert.equal(suggestion.spot.id, 'geo:2998324');
    assert.notEqual(suggestion.spot.id, 'dunkerque-digue-du-break');

    // A searched place carries no local calibration.
    assert.equal(suggestion.spot.windSectors, undefined);
    assert.equal(suggestion.spot.tidalUnitHeight, undefined);
    assert.equal(suggestion.spot.meanSpringRange, undefined);
  });

  it('asks the API for French results only, in French', async () => {
    const calls = stubFetch({ results: [] });
    await searchPlaces('Biarritz');

    const url = calls[0];
    assert.match(url, /countryCode=FR/);
    assert.match(url, /language=fr/);
    assert.match(url, /name=Biarritz/);
  });

  it('drops anything the API returns from another country', async () => {
    stubFetch({
      results: [DUNKERQUE, { ...DUNKERQUE, id: 99, name: 'Dunkerque', country_code: 'BE' }],
    });

    const found = await searchPlaces('Dunkerque');
    assert.equal(found.length, 1);
    assert.equal(found[0].spot.id, 'geo:2998324');
  });

  it('does not call the API for a query that is too short', async () => {
    const calls = stubFetch({ results: [DUNKERQUE] });

    assert.deepEqual(await searchPlaces(''), []);
    assert.deepEqual(await searchPlaces('a'.repeat(MIN_QUERY_LENGTH - 1)), []);
    assert.deepEqual(await searchPlaces('   '), []);
    assert.equal(calls.length, 0);
  });

  it('handles a response with no results', async () => {
    stubFetch({});
    assert.deepEqual(await searchPlaces('zzzzzz'), []);
  });

  it('copes with a place that has no region information', async () => {
    stubFetch({ results: [{ ...DUNKERQUE, admin1: undefined, admin2: undefined }] });
    const [suggestion] = await searchPlaces('Dunkerque');
    assert.equal(suggestion.context, '');
  });

  it('surfaces an API-level error', async () => {
    stubFetch({ error: true, reason: 'Parameter name is required' });
    await assert.rejects(() => searchPlaces('Lille'), /Parameter name is required/);
  });

  it('surfaces a transport failure', async () => {
    stubFetch({}, 500);
    await assert.rejects(() => searchPlaces('Lille'));
  });
});
