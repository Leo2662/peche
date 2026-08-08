import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  CLARITY_PROJECT_ID,
  CLARITY_TAG_MARKER,
  GA_MEASUREMENT_ID,
  GA_TAG_MARKER,
  ID_PATTERNS,
  missingTagReason,
  TAGS,
} from '../scripts/analytics.mjs';
import { GUIDE_PAGES } from '../scripts/build-site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readPublic = (name: string) => readFileSync(resolve(ROOT, 'public', name), 'utf8');

/**
 * Every page the site serves: landing.html becomes /, index.html becomes
 * /app/, and each guide becomes /<slug>/. A tag missing from one of them
 * under-counts the site without ever looking broken.
 */
const PAGES = ['landing.html', 'index.html', ...GUIDE_PAGES.map(({ slug }) => `${slug}.html`)];

/** Every third-party loader the pages are allowed to pull in. */
const LOADERS = [
  { label: 'Google tag', marker: GA_TAG_MARKER },
  { label: 'Clarity', marker: CLARITY_TAG_MARKER },
];

describe('the measurement ids', () => {
  it('name the two properties behind pecheaubar.fr', () => {
    assert.equal(GA_MEASUREMENT_ID, 'G-VYBEV628Q0');
    assert.match(GA_MEASUREMENT_ID, ID_PATTERNS.ga);
    assert.match(CLARITY_PROJECT_ID, ID_PATTERNS.clarity);
  });

  /**
   * Both ids are interpolated straight into a `<script>`. The patterns are what
   * guarantee neither can carry a quote or an angle bracket.
   */
  it('only match id shapes that are safe inside a script', () => {
    for (const unsafe of ['G-A"B', "G-A'B", 'G-A<B', 'G-A B']) {
      assert.ok(!ID_PATTERNS.ga.test(unsafe), `${unsafe} must not pass`);
    }
    for (const unsafe of ['ab"cd1234', "ab'cd1234", 'ab<cd1234', 'ab cd1234', 'ABCD1234']) {
      assert.ok(!ID_PATTERNS.clarity.test(unsafe), `${unsafe} must not pass`);
    }
  });

  /**
   * The failure this guards against is the one that already happened once: a
   * tag that ships, looks fine, and reports to nobody.
   */
  it('refuse a placeholder that would deploy a dead tag', () => {
    assert.ok(!ID_PATTERNS.clarity.test('PROJECT_ID'));
    assert.ok(!ID_PATTERNS.ga.test('G-XXXXXXXXXX'.toLowerCase()));
  });
});

describe('what a working tag needs', () => {
  it('is pinned part by part, for both vendors', () => {
    assert.deepEqual(
      TAGS.map((tag) => tag.label),
      ['Google tag', 'Clarity tag']
    );
    for (const tag of TAGS) {
      assert.ok(tag.requirements.length >= 4, `${tag.label} is under-specified`);
    }
  });

  it('names which tag and which part is missing', () => {
    const reason = (html: string) => {
      const missing = missingTagReason(html);
      assert.ok(missing !== null, 'expected a missing-tag reason, got none');
      return missing;
    };

    assert.match(reason(''), /Google tag has no gtag\.js loader/);
    assert.match(
      reason(readPublic('landing.html').replace(/t\.async=1;/, '')),
      /Clarity tag has no async load/
    );
  });
});

describe('every page the site serves', () => {
  it('carries both complete snippets', () => {
    for (const page of PAGES) {
      assert.equal(missingTagReason(readPublic(page)), null, `${page} has an incomplete tag`);
    }
  });

  /**
   * Both vendors say to put their snippet at the top of the head. Position does
   * not change whether a tag fires, but it does decide whether a visitor who
   * leaves early is counted at all — and for Clarity, how much of the session
   * the replay caught.
   *
   * Exactly one thing goes above them: the charset declaration. It is ~700
   * bytes of tag, and a charset the parser meets after 1024 bytes is one it
   * ignores — which would mangle every accent on a French page.
   */
  it('puts the tags at the top of the head, behind only the charset', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      const headOpen = html.indexOf('<head>') + '<head>'.length;
      const charset = html.indexOf('<meta charset="utf-8" />');
      const google = html.indexOf('<!-- Google tag (gtag.js) -->');
      const clarity = html.indexOf('<!-- Microsoft Clarity -->');

      assert.ok(charset > headOpen, `${page} has no charset inside its head`);
      assert.ok(charset < google, `${page} declares its charset after the tags`);
      assert.ok(google < clarity, `${page} orders the tags oddly`);

      // Nothing but the charset (and comments) may come before the tags.
      const before = html.slice(headOpen, google).replace(/<!--[\s\S]*?-->/g, '');
      assert.equal(
        before.replace('<meta charset="utf-8" />', '').trim(),
        '',
        `${page} has markup between <head> and the tags`
      );

      // And every other meta the page needs comes after them.
      assert.ok(html.indexOf('<meta name="viewport"') > clarity, `${page} splits its head oddly`);
    }
  });

  it('keeps the charset declaration inside the first 1024 bytes', () => {
    for (const page of PAGES) {
      const charset = readPublic(page).indexOf('<meta charset="utf-8" />');
      assert.ok(charset !== -1, `${page} has no charset declaration`);
      assert.ok(charset < 1024, `${page} declares its charset at byte ${charset}`);
    }
  });

  /**
   * Neither vendor may block first paint. gtag.js says so with `async` on the
   * tag; Clarity does it by building the element in JS and setting `async`
   * before it is inserted.
   */
  it('loads every third-party script asynchronously', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      assert.match(html, /<script async src="https:\/\/www\.googletagmanager\.com/);
      assert.match(html, /t\.async=1;/);
      // Nothing else may reach out: a synchronous third-party script in the
      // head would stall the render on someone else's server.
      for (const [, src] of html.matchAll(/<script[^>]*\ssrc="(https?:\/\/[^"]+)"/g)) {
        assert.ok(
          src.startsWith('https://www.googletagmanager.com/'),
          `${page} loads an unexpected script: ${src}`
        );
      }
    }
  });

  it('tags each page exactly once per vendor', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      for (const { label, marker } of LOADERS) {
        assert.equal(
          html.split(marker).length - 1,
          1,
          `${page} loads ${label} more than once — hits would be double-counted`
        );
      }
      assert.equal(html.split(`gtag('config'`).length - 1, 1, `${page} configures GA4 twice`);
      assert.equal(html.split('"clarity", "script"').length - 1, 1, `${page} starts Clarity twice`);
    }
  });

  it('measures our properties, never a foreign id', () => {
    for (const page of PAGES) {
      const html = readPublic(page);
      const gaIds = new Set(html.match(/\bG-[A-Z0-9]{6,}\b/g) ?? []);
      assert.deepEqual([...gaIds], [GA_MEASUREMENT_ID], `${page} mentions a foreign GA4 id`);

      const clarityIds = new Set(
        [...html.matchAll(/"clarity",\s*"script",\s*"([^"]+)"/g)].map((m) => m[1])
      );
      assert.deepEqual(
        [...clarityIds],
        [CLARITY_PROJECT_ID],
        `${page} mentions a foreign Clarity project`
      );
    }
  });
});

describe('the landing page, whose head is also its SEO surface', () => {
  /**
   * `tests/web.test.ts` asserts every absolute URL in the head is on our own
   * domain. The tags are the deliberate exception, and they reach their vendors
   * through `src=` and a JS string — neither of which is a crawl instruction.
   */
  it('adds no crawlable link to a third-party domain', () => {
    const html = readPublic('landing.html');
    const head = html.slice(0, html.indexOf('</head>'));

    for (const [, url] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.ok(url.startsWith('https://pecheaubar.fr'), `${url} is not on the site domain`);
    }
    assert.ok(head.includes(`src="${GA_TAG_MARKER}"`));
    assert.ok(head.includes(CLARITY_TAG_MARKER));
  });
});
