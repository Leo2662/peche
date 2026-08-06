import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  analyticsTag,
  injectAnalytics,
  MEASUREMENT_ID_PATTERN,
  readMeasurementId,
  TAG_MARKER,
} from '../scripts/analytics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readPublic = (name: string) => readFileSync(resolve(ROOT, 'public', name), 'utf8');

const ID = 'G-ABC1234567';

describe('the measurement id read from the environment', () => {
  it('is null when unset, blank or whitespace — analytics are simply off', () => {
    assert.equal(readMeasurementId({}), null);
    assert.equal(readMeasurementId({ GA_MEASUREMENT_ID: '' }), null);
    assert.equal(readMeasurementId({ GA_MEASUREMENT_ID: '   ' }), null);
  });

  it('accepts a real measurement id, trimmed', () => {
    assert.equal(readMeasurementId({ GA_MEASUREMENT_ID: ID }), ID);
    assert.equal(readMeasurementId({ GA_MEASUREMENT_ID: `  ${ID}\n` }), ID);
  });

  /**
   * A typo must stop the build. The alternative is a deploy that looks fine and
   * collects nothing until someone thinks to check Realtime.
   */
  it('throws on anything that is not one', () => {
    for (const value of [
      'UA-12345-1', // Universal Analytics, retired
      'GTM-ABC123', // a Tag Manager container
      'G-abc1234567', // lowercase
      'G-123', // too short
      'G-ABC1234567 G-XYZ', // two ids
      "G-ABC1234567'});alert(1);//", // a quote that would break out of the script
    ]) {
      assert.throws(
        () => readMeasurementId({ GA_MEASUREMENT_ID: value }),
        /not a GA4 measurement id/,
        `${value} should have been rejected`
      );
    }
  });

  it('only matches the id form the tag interpolates safely', () => {
    assert.ok(MEASUREMENT_ID_PATTERN.test(ID));
    for (const unsafe of ['G-A"B', "G-A'B", 'G-A<B', 'G-A B']) {
      assert.ok(!MEASUREMENT_ID_PATTERN.test(unsafe), `${unsafe} must not pass`);
    }
  });
});

describe('the analytics tag', () => {
  const tag = analyticsTag(ID);

  it('loads gtag.js for the configured property and configures it', () => {
    assert.match(tag, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-ABC1234567"><\/script>/);
    assert.match(tag, /gtag\('config', 'G-ABC1234567'/);
    assert.ok(tag.includes(TAG_MARKER), 'the marker must identify a tagged page');
  });

  it('sets up dataLayer before anything pushes to it', () => {
    assert.ok(
      tag.indexOf('window.dataLayer = window.dataLayer || []') < tag.indexOf("gtag('consent'"),
      'dataLayer must exist before the first gtag call'
    );
  });

  /**
   * Consent defaults are only defaults if they land in dataLayer before the
   * library reads it. Ordering is the whole mechanism, so it is pinned.
   */
  it('declares consent defaults before the config and before the loader', () => {
    const consent = tag.indexOf("gtag('consent', 'default'");
    const config = tag.indexOf("gtag('config'");
    const loader = tag.indexOf(TAG_MARKER);

    assert.ok(consent !== -1, 'no consent defaults');
    assert.ok(consent < config, 'consent defaults must precede config');
    assert.ok(consent < loader, 'consent defaults must precede the gtag.js loader');
  });

  it('denies every advertising grant and turns Google Signals off', () => {
    for (const denied of ['ad_storage', 'ad_user_data', 'ad_personalization']) {
      assert.match(
        tag,
        new RegExp(`${denied}: 'denied'`),
        `${denied} must default to denied — the site runs no advertising`
      );
    }
    assert.match(tag, /analytics_storage: 'granted'/);
    assert.match(tag, /allow_google_signals: false/);
    assert.match(tag, /allow_ad_personalization_signals: false/);
  });

  it('refuses to build a tag for an id that is not one', () => {
    assert.throws(() => analyticsTag('G-abc'), /not a GA4 measurement id/);
  });
});

describe('injecting the tag into a built page', () => {
  it('puts it last in the head, leaving </head> where it was', () => {
    const html = '<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n';
    const out = injectAnalytics(html, ID);

    assert.ok(out.indexOf(TAG_MARKER) < out.indexOf('</head>'), 'the tag must be inside the head');
    assert.ok(out.indexOf('<title>x</title>') < out.indexOf(TAG_MARKER), 'it goes last');
    assert.match(out, /\n {2}<\/head>/, '</head> kept its own line and indentation');
    assert.ok(out.includes('<body></body>'), 'the body is untouched');
  });

  it('never tags a page twice', () => {
    assert.throws(
      () => injectAnalytics(injectAnalytics('<head></head>', ID), ID),
      /already carries a gtag/
    );
  });

  it('fails loudly on a page with no head', () => {
    assert.throws(() => injectAnalytics('<html><body></body></html>', ID), /no <\/head>/);
  });

  it('tags both of the pages the site actually ships', () => {
    // The app template is what Expo exports to /app/; landing.html becomes /.
    for (const page of ['index.html', 'landing.html']) {
      const out = injectAnalytics(readPublic(page), ID);
      const head = out.slice(0, out.indexOf('</head>'));
      assert.ok(head.includes(TAG_MARKER), `${page} was not tagged inside its head`);
      assert.ok(head.includes(`gtag('config', '${ID}'`), `${page} has no config call`);
    }
  });
});

describe('the committed public/ files', () => {
  /**
   * The id belongs in the host's environment, injected at build time. A hard
   * coded one would also fire from `expo start --web`, filling the property
   * with development traffic.
   */
  it('carry no analytics tag of their own', () => {
    for (const page of ['index.html', 'landing.html']) {
      const html = readPublic(page);
      assert.ok(!html.includes(TAG_MARKER), `${page} has a hard-coded gtag`);
      assert.ok(!/\bG-[A-Z0-9]{4,16}\b/.test(html), `${page} has a hard-coded measurement id`);
    }
  });
});
