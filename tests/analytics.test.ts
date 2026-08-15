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
import { GUIDES } from '../site/data/guides.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...segments: string[]) => readFileSync(resolve(ROOT, ...segments), 'utf8');

/**
 * Every page the site serves, as it is actually served.
 *
 * The landing page and the guides come out of the Astro build, which composes
 * them from one `Analytics.astro` and then minifies the result — so this reads
 * the build, not the component. The app's template is the exception: Expo owns
 * it, and it is checked where it is edited.
 *
 * A tag missing from one page under-counts the site without ever looking
 * broken, which is why every page is held to this and not just a sample.
 */
const PAGES: { label: string; html: string }[] = [
  { label: 'the landing page', html: read('dist', 'index.html') },
  { label: "the app's template", html: read('public', 'index.html') },
  ...GUIDES.map(({ slug }) => ({ label: slug, html: read('dist', slug, 'index.html') })),
];

const landingHtml = PAGES[0].html;

/**
 * The charset declaration, either way it is written: Astro minifies it to
 * `<meta charset="utf-8">`, and Expo's hand-written template keeps the XHTML
 * style self-closing form.
 */
const CHARSET = /<meta charset="utf-8"\s*\/?>/;

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
      reason(landingHtml.replace(/t\.async=1;/, '')),
      /Clarity tag has no async load/
    );
  });
});

describe('every page the site serves', () => {
  it('carries both complete snippets', () => {
    for (const { label, html } of PAGES) {
      assert.equal(missingTagReason(html), null, `${label} has an incomplete tag`);
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
    for (const { label, html } of PAGES) {
      const headOpen = html.indexOf('<head>') + '<head>'.length;
      const charset = html.search(CHARSET);
      // Located by the loaders themselves rather than by the comments that
      // label them: a comment can survive a tag that no longer ships.
      const google = html.indexOf(`<script async src="${GA_TAG_MARKER}"`);
      const clarity = html.indexOf(CLARITY_TAG_MARKER);

      assert.ok(charset > headOpen, `${label} has no charset inside its head`);
      assert.ok(google !== -1, `${label} has no Google tag loader`);
      assert.ok(charset < google, `${label} declares its charset after the tags`);
      assert.ok(google < clarity, `${label} orders the tags oddly`);

      // Nothing but the charset (and comments) may come before the tags.
      const before = html.slice(headOpen, google).replace(/<!--[\s\S]*?-->/g, '');
      assert.equal(
        before.replace(CHARSET, '').trim(),
        '',
        `${label} has markup between <head> and the tags`
      );

      // And every other meta the page needs comes after them.
      assert.ok(html.indexOf('<meta name="viewport"') > clarity, `${label} splits its head oddly`);
    }
  });

  it('keeps the charset declaration inside the first 1024 bytes', () => {
    for (const { label, html } of PAGES) {
      const charset = html.search(CHARSET);
      assert.ok(charset !== -1, `${label} has no charset declaration`);
      assert.ok(charset < 1024, `${label} declares its charset at byte ${charset}`);
    }
  });

  /**
   * Neither vendor may block first paint. gtag.js says so with `async` on the
   * tag; Clarity does it by building the element in JS and setting `async`
   * before it is inserted.
   */
  it('loads every third-party script asynchronously', () => {
    for (const { label, html } of PAGES) {
      assert.match(html, /<script async src="https:\/\/www\.googletagmanager\.com/);
      assert.match(html, /t\.async=1;/);
      // Nothing else may reach out: a synchronous third-party script in the
      // head would stall the render on someone else's server.
      for (const [, src] of html.matchAll(/<script[^>]*\ssrc="(https?:\/\/[^"]+)"/g)) {
        assert.ok(
          src.startsWith('https://www.googletagmanager.com/'),
          `${label} loads an unexpected script: ${src}`
        );
      }
    }
  });

  it('tags each page exactly once per vendor', () => {
    for (const { label, html } of PAGES) {
      for (const loader of LOADERS) {
        assert.equal(
          html.split(loader.marker).length - 1,
          1,
          `${label} loads ${loader.label} more than once — hits would be double-counted`
        );
      }
      assert.equal(html.split(`gtag('config'`).length - 1, 1, `${label} configures GA4 twice`);
      assert.equal(html.split('"clarity", "script"').length - 1, 1, `${label} starts Clarity twice`);
    }
  });

  it('measures our properties, never a foreign id', () => {
    for (const { label, html } of PAGES) {
      const gaIds = new Set(html.match(/\bG-[A-Z0-9]{6,}\b/g) ?? []);
      assert.deepEqual([...gaIds], [GA_MEASUREMENT_ID], `${label} mentions a foreign GA4 id`);

      const clarityIds = new Set(
        [...html.matchAll(/"clarity",\s*"script",\s*"([^"]+)"/g)].map((m) => m[1])
      );
      assert.deepEqual(
        [...clarityIds],
        [CLARITY_PROJECT_ID],
        `${label} mentions a foreign Clarity project`
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
    const head = landingHtml.slice(0, landingHtml.indexOf('</head>'));

    for (const [, url] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.ok(url.startsWith('https://pecheaubar.fr'), `${url} is not on the site domain`);
    }
    assert.ok(head.includes(`src="${GA_TAG_MARKER}"`));
    assert.ok(head.includes(CLARITY_TAG_MARKER));
  });
});
