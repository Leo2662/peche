import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { buildSitemap, isoDate, ROUTES, SITE_URL } from '../scripts/generate-sitemap.mjs';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (name: string) => readFileSync(resolve(PUBLIC_DIR, name), 'utf8');

const DOMAIN = 'https://pecheaubar.fr';

describe('sitemap generation', () => {
  it('points at the real domain', () => {
    assert.equal(SITE_URL, DOMAIN);
    assert.ok(!SITE_URL.endsWith('/'), 'SITE_URL must not end in a slash — paths add it');
  });

  it('lists only routes the app actually serves', () => {
    // A single-route SPA. Listing anything else would hand Google soft-404s.
    assert.equal(ROUTES.length, 1);
    assert.equal(ROUTES[0].path, '/');
  });

  it('produces well-formed XML with the sitemaps.org namespace', () => {
    const xml = buildSitemap('2026-08-04');
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /<\/urlset>\s*$/);

    // Balanced tags, one <url> per route.
    for (const tag of ['url', 'loc', 'lastmod', 'changefreq']) {
      const open = xml.match(new RegExp(`<${tag}>`, 'g')) ?? [];
      const close = xml.match(new RegExp(`</${tag}>`, 'g')) ?? [];
      assert.equal(open.length, ROUTES.length, `<${tag}> count`);
      assert.equal(open.length, close.length, `<${tag}> is unbalanced`);
    }
  });

  it('emits absolute URLs, never relative paths', () => {
    const locs = [...buildSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, ROUTES.length);
    for (const loc of locs) {
      assert.ok(loc.startsWith(`${DOMAIN}/`), `${loc} is not an absolute URL on the domain`);
      assert.doesNotThrow(() => new URL(loc));
    }
  });

  it('dates in the W3C form the spec asks for', () => {
    assert.match(isoDate(new Date('2026-08-04T22:30:00Z')), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(isoDate(new Date('2026-08-04T22:30:00Z')), '2026-08-04');
    assert.match(buildSitemap(), /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });
});

describe('the committed public/ files', () => {
  it('ships a sitemap matching what the generator produces', () => {
    const committed = read('sitemap.xml');
    const lastmod = committed.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    assert.ok(lastmod, 'the committed sitemap has no lastmod');

    // Same bytes as a fresh run with that date: catches a hand-edited file.
    assert.equal(committed, buildSitemap(lastmod));
  });

  it('points robots.txt at the sitemap and lets crawlers in', () => {
    const robots = read('robots.txt');
    assert.match(robots, /^Sitemap: https:\/\/pecheaubar\.fr\/sitemap\.xml$/m);
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Allow: \/$/m);
    // Blocking the bundle would stop Google rendering the page at all.
    assert.ok(!/^Disallow: \/_expo/m.test(robots));
  });

  it('agrees with index.html on the domain', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="canonical" href="https:\/\/pecheaubar\.fr\/" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/pecheaubar\.fr\/" \/>/);

    // Every absolute URL in the head must be on our domain.
    for (const [, url] of html.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      if (url.includes('necolas.github.io')) continue; // reset stylesheet credit
      assert.ok(url.startsWith(DOMAIN), `${url} is not on the site domain`);
    }
  });

  it('is a French page with the metadata an indexed page needs', () => {
    const html = read('index.html');
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<meta property="og:locale" content="fr_FR" \/>/);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    assert.ok(title.length > 0 && title.length <= 60, `title is ${title.length} chars`);

    const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
    assert.ok(
      description.length >= 70 && description.length <= 160,
      `description is ${description.length} chars`
    );
  });

  it('keeps the mount point Expo injects the bundle into', () => {
    const html = read('index.html');
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /id="expo-reset"/);
  });
});
