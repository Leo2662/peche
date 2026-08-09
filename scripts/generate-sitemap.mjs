#!/usr/bin/env node
/**
 * Regenerate public/sitemap.xml.
 *
 * Only the pages that are real server-rendered HTML belong here: the landing
 * page and the per-spot guides. The app itself is a single client-rendered
 * route carrying a `noindex`, so listing it would hand Google a soft-404.
 *
 * `lastmod` is the point of running this at build time rather than committing a
 * date by hand: a stale one is worse than none, because Google learns to ignore
 * it. Run via `npm run build:web`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_URL = 'https://pecheaubar.fr';

/**
 * Every indexable URL the deployed site answers on.
 *
 * Add an entry here only when the site genuinely serves that path — and add the
 * page to `GUIDE_PAGES` in `build-site.mjs` at the same time, which is what
 * puts the file at that path in the first place.
 *
 * Trailing slashes are deliberate: `vercel.json` sets `trailingSlash: true`, so
 * `/peche-bar-boulogne-sur-mer` redirects to `/peche-bar-boulogne-sur-mer/`.
 * Pointing the sitemap at the pre-redirect form would spend crawl budget on a
 * 308 for every guide.
 */
export const ROUTES = [
  {
    path: '/',
    // The score is recomputed from fresh forecasts continuously; the page
    // itself is worth re-crawling daily.
    changefreq: 'daily',
  },
  // Editorial guides: the tide and wind rules they describe do not move.
  { path: '/peche-bar-boulogne-sur-mer/', changefreq: 'monthly' },
  { path: '/peche-bar-dunkerque/', changefreq: 'monthly' },
  { path: '/peche-bar-calais/', changefreq: 'monthly' },
  { path: '/peche-bar-normandie/', changefreq: 'monthly' },
  { path: '/peche-bar-bretagne/', changefreq: 'monthly' },
  { path: '/peche-bar-vendee/', changefreq: 'monthly' },
];

/** YYYY-MM-DD, the W3C date form the sitemap spec asks for. */
export function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function buildSitemap(lastmod = isoDate()) {
  const urls = ROUTES.map(
    (route) =>
      `  <url>\n` +
      `    <loc>${SITE_URL}${route.path}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>${route.changefreq}</changefreq>\n` +
      `  </url>`
  ).join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`
  );
}

// Only write when run directly, so the test can import the builder.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buildSitemap(), 'utf8');
  console.log(`sitemap: ${ROUTES.length} URL → ${target}`);
}
