import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  GA_MEASUREMENT_ID,
  missingTagReason,
  TAG_MARKER,
  TAG_REQUIREMENTS,
} from '../scripts/analytics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readPublic = (name: string) => readFileSync(resolve(ROOT, 'public', name), 'utf8');

/** Both pages the site serves: landing.html becomes /, index.html becomes /app/. */
const PAGES = ['landing.html', 'index.html'];

describe('the Google tag', () => {
  it('names the property behind pecheaubar.fr', () => {
    assert.equal(GA_MEASUREMENT_ID, 'G-VYBEV628Q0');
    assert.match(GA_MEASUREMENT_ID, /^G-[A-Z0-9]+$/);
  });

  /**
   * Tag Assistant only ever says "detected" or not. These are the parts that
   * make it work, pinned one by one, so a broken snippet says which half went
   * missing instead of failing as a whole.
   */
  it('reports which part of the snippet is missing', () => {
    assert.equal(missingTagReason(''), 'no the gtag.js loader, async');
    assert.equal(
      missingTagReason(`<script async src="${TAG_MARKER}"></script>`),
      'no the dataLayer bootstrap'
    );
    assert.ok(TAG_REQUIREMENTS.length >= 5, 'the snippet has five moving parts');
  });
});

describe('every page the site serves', () => {
  it('carries the complete gtag.js snippet', () => {
    for (const page of PAGES) {
      assert.equal(missingTagReason(readPublic(page)), null, `${page} has an incomplete tag`);
    }
  });

  /**
   * Google's instruction is "juste après l'élément <head>". Position does not
   * change whether the tag fires, but it does decide whether a hit is recorded
   * for a visitor who leaves before the rest of the head has parsed.
   */
  it('puts it immediately after <head>, ahead of everything else', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      const headOpen = html.indexOf('<head>');
      const tag = html.indexOf('<!-- Google tag (gtag.js) -->');

      assert.ok(headOpen !== -1, `${page} has no <head>`);
      assert.ok(tag !== -1, `${page} is missing the Google tag comment`);

      const between = html.slice(headOpen + '<head>'.length, tag);
      assert.match(between, /^\s*$/, `${page} has markup between <head> and the tag: ${between}`);
    }
  });

  it('keeps the charset declaration inside the first 1024 bytes', () => {
    // The tag now sits above <meta charset>, and a declaration the parser finds
    // too late is a declaration it ignores.
    for (const page of PAGES) {
      const charset = readPublic(page).indexOf('<meta charset="utf-8" />');
      assert.ok(charset !== -1, `${page} has no charset declaration`);
      assert.ok(charset < 1024, `${page} declares its charset at byte ${charset}`);
    }
  });

  it('loads gtag.js asynchronously, so the tag never blocks the render', () => {
    for (const page of PAGES) {
      assert.match(readPublic(page), /<script async src="https:\/\/www\.googletagmanager\.com/);
    }
  });

  it('tags each page exactly once', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      assert.equal(
        html.split(TAG_MARKER).length - 1,
        1,
        `${page} loads gtag.js more than once — hits would be double-counted`
      );
      assert.equal(html.split(`gtag('config'`).length - 1, 1, `${page} configures twice`);
    }
  });

  it('measures one property, never a second id', () => {
    for (const page of PAGES) {
      const ids = new Set(readPublic(page).match(/\bG-[A-Z0-9]{6,}\b/g) ?? []);
      assert.deepEqual([...ids], [GA_MEASUREMENT_ID], `${page} mentions a foreign measurement id`);
    }
  });
});

describe('the landing page, whose head is also its SEO surface', () => {
  /**
   * `tests/web.test.ts` asserts every absolute URL in the head is on our own
   * domain — the tag is the one deliberate exception, and it is a script rather
   * than something a crawler is told to follow.
   */
  it('adds no crawlable link to a third-party domain', () => {
    const html = readPublic('landing.html');
    const head = html.slice(0, html.indexOf('</head>'));

    for (const [, url] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.ok(url.startsWith('https://pecheaubar.fr'), `${url} is not on the site domain`);
    }
    // The tag reaches Google through src=, which is not a crawl instruction.
    assert.ok(head.includes(`src="${TAG_MARKER}"`));
  });
});
