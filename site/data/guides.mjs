/**
 * The site's route table: every indexable page pecheaubar.fr serves.
 *
 * This is the one list. The footer builds its nav from it, `sitemap.xml.js`
 * builds the sitemap from it, and each guide page reads its own entry for the
 * breadcrumb. It used to be two lists — `GUIDE_PAGES` in `build-site.mjs` and
 * `ROUTES` in `generate-sitemap.mjs` — edited by hand in different files, with
 * a check whose whole job was to notice when someone updated one and not the
 * other. There is nothing left for that check to compare.
 *
 * Adding a guide is now: a page in `site/pages/<slug>.astro`, and an entry
 * here. The build fails if a slug names no page.
 */

/** No trailing slash: every path below adds its own. */
export const SITE_URL = 'https://pecheaubar.fr';

/**
 * @typedef {object} Guide
 * @property {string} slug   the path it is served from, without slashes
 * @property {string} place  what the guide is about — a commune for the spot
 *                           pages, a region for the wider ones — spelled the
 *                           way the page spells it. It is the breadcrumb, the
 *                           footer link, and what the tests hold each page to
 *                           naming in its own title and h1: the one mistake
 *                           that would quietly turn a spot page into a copy of
 *                           its neighbour.
 * @property {'à'|'en'} preposition  how the place takes "Pêche au bar __ X" in
 *                           the landing page's footer, and in the headline
 *                           schema.org reads. Communes take *à* and these
 *                           regions take *en*; nothing in the slug says which,
 *                           and the next region added might take neither, so it
 *                           is written down rather than derived.
 * @property {'commune'|'region'} kind  a spot page or a wider one. It decides
 *                           whether the postal address in the Article schema
 *                           carries an `addressLocality`.
 * @property {string} region  the administrative region or department the
 *                           `PostalAddress` names. Equal to `place` on a region
 *                           page, its department on a commune page.
 * @property {{latitude: number, longitude: number}} geo  what the Article
 *                           schema points at: the spot for a commune, the
 *                           middle of the coastline for a region.
 */

/**
 * North to south along the coast, which is the order the footers read in and
 * therefore the order the sitemap announces.
 *
 * @type {readonly Guide[]}
 */
export const GUIDES = [
  {
    slug: 'peche-bar-dunkerque',
    place: 'Dunkerque',
    preposition: 'à',
    kind: 'commune',
    region: 'Nord',
    geo: { latitude: 51.05, longitude: 2.3 },
  },
  {
    slug: 'peche-bar-calais',
    place: 'Calais',
    preposition: 'à',
    kind: 'commune',
    region: 'Pas-de-Calais',
    geo: { latitude: 50.968, longitude: 1.856 },
  },
  {
    slug: 'peche-bar-boulogne-sur-mer',
    place: 'Boulogne-sur-Mer',
    preposition: 'à',
    kind: 'commune',
    region: 'Pas-de-Calais',
    geo: { latitude: 50.726, longitude: 1.614 },
  },
  {
    slug: 'peche-bar-normandie',
    place: 'Normandie',
    preposition: 'en',
    kind: 'region',
    region: 'Normandie',
    geo: { latitude: 49.35, longitude: -0.6 },
  },
  {
    slug: 'peche-bar-bretagne',
    place: 'Bretagne',
    preposition: 'en',
    kind: 'region',
    region: 'Bretagne',
    geo: { latitude: 48.2, longitude: -3.4 },
  },
  {
    slug: 'peche-bar-vendee',
    place: 'Vendée',
    preposition: 'en',
    kind: 'region',
    region: 'Vendée',
    geo: { latitude: 46.6, longitude: -1.9 },
  },
];

/** The entry for a slug, or a thrown error naming the slug that has none. */
export function guideBySlug(slug) {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) throw new Error(`no guide registered for "${slug}" — add it to site/data/guides.mjs`);
  return guide;
}

/** The path a guide is served from, trailing slash included. */
export const pathOf = (slug) => `/${slug}/`;

/** Its absolute URL — what a canonical, an `og:url` or a `<loc>` needs. */
export const urlOf = (slug) => `${SITE_URL}${pathOf(slug)}`;

/**
 * Every URL the sitemap announces, in the order it announces them.
 *
 * The landing page is first and re-crawled daily: the score behind it is
 * recomputed from fresh forecasts continuously. The guides describe tide and
 * wind rules that do not move.
 *
 * The app at `/app/` is deliberately absent. It is a single client-rendered
 * route carrying a `noindex`, so listing it would hand Google a soft-404.
 */
export const ROUTES = [
  { path: '/', changefreq: 'daily' },
  ...GUIDES.map(({ slug }) => ({ path: pathOf(slug), changefreq: 'monthly' })),
];
