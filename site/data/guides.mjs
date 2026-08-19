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
 *
 * There are two kinds of entry, because there turned out to be two kinds of
 * guide. A **spot guide** answers "pêche au bar à Calais" and everything it
 * says about itself follows from its place — its breadcrumb, its headline, the
 * postal address and the coordinates in its schema. A **topic guide** answers
 * "quelle canne pour le bar", which no place decides, so it writes those things
 * down instead of deriving them. `subjectOf()` is where the two meet: it hands
 * `GuideLayout` the same three fields whichever kind it was given.
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

/**
 * @typedef {object} Topic
 * @property {string} slug   the path it is served from, without slashes
 * @property {string} crumb  the short label: the last step of the breadcrumb,
 *                           and the link the other guides carry in their footer.
 *                           A place names itself in two words; a question does
 *                           not, so the short form is written rather than cut.
 * @property {string} nav    the long label, spelled out for the landing page —
 *                           the one page whose anchor text Google reads as a
 *                           description of the target.
 * @property {string} headline  what the `Article` schema announces. On a spot
 *                           guide this is a template over the place; here the
 *                           page's own subject is the only thing that could
 *                           produce it.
 * @property {string} about  the thing the article is about, for the `about`
 *                           node. Not a `Place`, which is the whole difference
 *                           between the two kinds.
 */

/**
 * The guides that are not about a stretch of coast.
 *
 * A spot guide answers *where* and *when*; these answer *with what* and *how*.
 * They rank on searches no commune appears in ("quelle canne pour le bar du
 * bord"), and they are the pages a spot guide can hand a reader off to once it
 * has told them the tide is right.
 *
 * @type {readonly Topic[]}
 */
export const TOPICS = [
  {
    slug: 'canne-peche-bar-du-bord',
    crumb: 'Quelle canne',
    nav: 'Quelle canne pour le bar du bord',
    headline: 'Quelle canne pour la pêche au bar du bord : longueur, puissance, action',
    about: 'Canne à pêche au bar du bord',
  },
  {
    slug: 'leurres-souples-bar',
    crumb: 'Leurres souples',
    nav: 'Les meilleurs leurres souples à bar',
    headline: 'Les 7 meilleurs leurres souples pour le bar, et comment les animer',
    about: 'Leurre souple pour la pêche du bar',
  },
];

/** Every page in the route table, spot guides first. */
export const PAGES = [...GUIDES, ...TOPICS];

/**
 * What a page's schema blocks need to know about their subject: the name the
 * breadcrumb ends on, the headline the `Article` announces, and the entity it
 * is `about`.
 *
 * A spot guide derives all three from its place — that is what `preposition`,
 * `kind`, `region` and `geo` are for, and the one headline shape all six share
 * is what keeps them in step. A topic guide has none of that to derive from and
 * carries the three fields itself. Either way the layout receives the same
 * object and has no idea which kind it rendered.
 */
export function subjectOf(slug) {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (guide) {
    const { place, preposition, kind, region, geo } = guide;
    return {
      crumb: place,
      headline: `Pêche au bar ${preposition} ${place} : meilleurs horaires et conditions`,
      about: {
        '@type': 'Place',
        name: place,
        address: {
          '@type': 'PostalAddress',
          // A region page has no locality to name — only the region itself.
          ...(kind === 'commune' ? { addressLocality: place } : {}),
          addressRegion: region,
          addressCountry: 'FR',
        },
        geo: { '@type': 'GeoCoordinates', ...geo },
      },
    };
  }

  const topic = TOPICS.find((t) => t.slug === slug);
  if (topic) {
    const { crumb, headline, about } = topic;
    return { crumb, headline, about: { '@type': 'Thing', name: about } };
  }

  throw new Error(`no guide registered for "${slug}" — add it to site/data/guides.mjs`);
}

/**
 * How a link to a page reads in a footer.
 *
 * The landing page spells every link out, because it is the page whose anchor
 * text Google reads; between guides the short form is enough and the nav has
 * seven links to fit.
 */
export const linkLabel = (entry, long) =>
  entry.place
    ? long
      ? `Pêche au bar ${entry.preposition} ${entry.place}`
      : entry.place
    : long
      ? entry.nav
      : entry.crumb;

/** The path a guide is served from, trailing slash included. */
export const pathOf = (slug) => `/${slug}/`;

/** Its absolute URL — what a canonical, an `og:url` or a `<loc>` needs. */
export const urlOf = (slug) => `${SITE_URL}${pathOf(slug)}`;

/**
 * Every URL the sitemap announces, in the order it announces them.
 *
 * The landing page is first and re-crawled daily: the score behind it is
 * recomputed from fresh forecasts continuously. The guides describe tide rules,
 * wind rules and tackle that do not move.
 *
 * The app at `/app/` is deliberately absent. It is a single client-rendered
 * route carrying a `noindex`, so listing it would hand Google a soft-404.
 */
export const ROUTES = [
  { path: '/', changefreq: 'daily' },
  ...PAGES.map(({ slug }) => ({ path: pathOf(slug), changefreq: 'monthly' })),
];
