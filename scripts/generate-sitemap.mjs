#!/usr/bin/env node
/**
 * Regenerate public/sitemap.xml.
 *
 * BassScore is a single-route client-side app, so the sitemap has exactly one
 * URL. That is not an oversight — listing paths the app does not serve would
 * hand Google soft-404s. What the file is actually for is telling crawlers the
 * site exists and when it last changed.
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
 * Every URL the deployed site answers on.
 *
 * Add an entry here only when the app genuinely serves that path. If per-spot
 * or per-day URLs are ever added, this is where they belong.
 */
export const ROUTES = [
  {
    path: '/',
    // The score is recomputed from fresh forecasts continuously; the page
    // itself is worth re-crawling daily.
    changefreq: 'daily',
  },
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
