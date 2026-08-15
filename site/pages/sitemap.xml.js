import { buildSitemap } from '../data/sitemap.mjs';

/** Served at `/sitemap.xml`, built once when the site is built. */
export function GET() {
  return new Response(buildSitemap(), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
