import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { buildSitemap, isoDate, ROUTES, SITE_URL } from '../scripts/generate-sitemap.mjs';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (name: string) => readFileSync(resolve(PUBLIC_DIR, name), 'utf8');

const DOMAIN = 'https://pecheaubar.fr';

/** Width and height straight out of a PNG's IHDR chunk. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', 'not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

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
    assert.match(html, /hreflang="fr"/);
    assert.match(html, /hreflang="x-default"/);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    assert.ok(title.length > 0 && title.length <= 60, `title is ${title.length} chars`);

    const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
    assert.ok(
      description.length >= 70 && description.length <= 160,
      `description is ${description.length} chars`
    );
  });

  /**
   * The app's stated purpose is "prévoir les meilleures conditions de pêche au
   * bar", and the domain is built on that phrase. If the title and description
   * drift away from it, the meta tags stop doing their job.
   */
  it('states the purpose, in the words the domain is built on', () => {
    const html = read('index.html');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';

    for (const field of [title, description]) {
      const text = field.toLowerCase();
      assert.match(text, /p[êe]che au bar/, `"${field}" does not name the subject`);
      assert.match(text, /pr[ée]vo/, `"${field}" does not state that it forecasts`);
      assert.match(text, /meilleure/, `"${field}" does not promise the best conditions`);
    }

    // The description should say what the score is built from, not just exist.
    assert.match(description.toLowerCase(), /mar[ée]e/);
    assert.match(description, /0 à 100/);
  });

  it('ships a share card the meta tags actually point at', () => {
    const html = read('index.html');
    assert.match(html, /property="og:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    // Without alt text the card is unreadable to a screen reader. The
    // attribute is wrapped across lines in the source, hence the \s+.
    assert.match(html, /property="og:image:alt"\s+content="[^"]{20,}"/);

    // Twitter needs the large card explicitly; it does not infer it.
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);

    // And the files have to be there, at the declared size.
    const og = readFileSync(resolve(PUBLIC_DIR, 'og-image.png'));
    assert.deepEqual(pngSize(og), { width: 1200, height: 630 }, 'og-image.png is the wrong size');
    assert.deepEqual(pngSize(readFileSync(resolve(PUBLIC_DIR, 'apple-touch-icon.png'))), {
      width: 180,
      height: 180,
    });
    assert.deepEqual(pngSize(readFileSync(resolve(PUBLIC_DIR, 'icon-512.png'))), {
      width: 512,
      height: 512,
    });
  });

  it('stops iOS turning scores and times into phone links', () => {
    // The screen is full of "19:10 – 21:00" and bare three-digit numbers.
    assert.match(read('index.html'), /name="format-detection" content="[^"]*telephone=no/);
  });

  it('has a manifest consistent with the page', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);

    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.equal(manifest.lang, 'fr');
    assert.equal(manifest.start_url, '/');
    // Must match the page, or the splash flashes a different colour.
    assert.equal(manifest.theme_color, '#030A12');
    assert.match(html, /name="theme-color" content="#030A12"/);

    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      const file = readFileSync(resolve(PUBLIC_DIR, icon.src.replace(/^\//, '')));
      const { width, height } = pngSize(file);
      assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} does not match its declared size`);
    }
  });

  it('keeps the mount point Expo injects the bundle into', () => {
    const html = read('index.html');
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /id="expo-reset"/);
  });
});
