#!/usr/bin/env node
/**
 * Compose the deployable site from an Expo web export.
 *
 * Expo puts the app at the root and copies everything in public/ verbatim
 * alongside it. The site wants the landing page at the root instead, with the
 * app one level down and each editorial guide on its own clean path:
 *
 *   dist/index.html                            the landing page (was public/landing.html)
 *   dist/app/index.html                        the app          (was dist/index.html)
 *   dist/peche-bar-boulogne-sur-mer/index.html a guide          (was public/<slug>.html)
 *   dist/_expo/…                               the bundle, referenced absolutely from /,
 *                                              so it loads identically from any depth
 *
 * Run through `npm run build:web`, after `expo export`.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLARITY_PROJECT_ID, GA_MEASUREMENT_ID, missingTagReason } from './analytics.mjs';
import { ROUTES, SITE_URL } from './generate-sitemap.mjs';

/**
 * The editorial pages. `public/<slug>.html` becomes `/<slug>/`.
 *
 * `place` is the commune the guide is about, spelled as the page spells it. It
 * is here so the tests can hold every guide to naming its own subject in its
 * title and its h1 — the one mistake that would quietly turn a spot page into
 * a copy of its neighbour.
 *
 * Adding one here is half the job — the other half is an entry in `ROUTES` in
 * `generate-sitemap.mjs`, so the page is actually announced to crawlers.
 * `checkGuideRoutes` refuses to build if the two lists disagree.
 */
export const GUIDE_PAGES = [
  { slug: 'peche-bar-boulogne-sur-mer', place: 'Boulogne-sur-Mer' },
  { slug: 'peche-bar-dunkerque', place: 'Dunkerque' },
];

/**
 * Why the sitemap and the build disagree about the guides, or null when they
 * match. The mismatch matters in both directions: a guide the sitemap never
 * announces is invisible, and a sitemap entry with no page behind it is a 404
 * handed to Google.
 *
 * Exported so the test can assert the two lists stay in step without running a
 * build.
 */
export function checkGuideRoutes() {
  const built = GUIDE_PAGES.map(({ slug }) => `/${slug}/`).sort();
  const routed = ROUTES.map((route) => route.path)
    .filter((path) => path !== '/')
    .sort();

  if (built.join() === routed.join()) return null;
  return (
    `the sitemap lists ${routed.join(', ') || 'no guides'} but the build produces ` +
    `${built.join(', ') || 'none'} — update ROUTES in generate-sitemap.mjs`
  );
}

function fail(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}

function buildSite(dist) {
  const appSource = resolve(dist, 'index.html');
  const landingSource = resolve(dist, 'landing.html');

  if (!existsSync(appSource)) fail(`no index.html in ${dist} — run expo export first`);
  if (!existsSync(landingSource)) {
    fail('no landing.html in the export — is public/landing.html there?');
  }

  // 1. Move the app to /app/.
  const appDir = resolve(dist, 'app');
  mkdirSync(appDir, { recursive: true });
  renameSync(appSource, resolve(appDir, 'index.html'));

  // 2. Promote the landing page to the root.
  renameSync(landingSource, resolve(dist, 'index.html'));

  // 3. Give each guide its own directory, so it serves from a clean path rather
  //    than a .html its canonical URL would then disagree with.
  const guides = GUIDE_PAGES.map(({ slug }) => {
    const source = resolve(dist, `${slug}.html`);
    if (!existsSync(source)) fail(`no ${slug}.html in the export — is public/${slug}.html there?`);

    const dir = resolve(dist, slug);
    mkdirSync(dir, { recursive: true });
    renameSync(source, resolve(dir, 'index.html'));

    return { slug, html: readFileSync(resolve(dir, 'index.html'), 'utf8') };
  });

  // 4. Sanity-check the result rather than trusting the moves.
  const landing = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const app = readFileSync(resolve(appDir, 'index.html'), 'utf8');

  if (!landing.includes('href="/app/"')) fail('the landing page has no link to the app');
  if (landing.includes('id="root"')) fail('the landing page looks like the app template');
  if (!app.includes('id="root"')) fail('the app page lost its mount point');
  if (!/src="\/_expo\//.test(app)) {
    fail('the app page does not load the bundle from an absolute path');
  }
  if (!/noindex/.test(app)) fail('the app page should not be indexed — the landing page is');

  for (const { slug, html } of guides) {
    // A guide whose canonical points anywhere but its own path is a guide that
    // asks Google to index a URL it is not served from.
    if (!html.includes(`<link rel="canonical" href="${SITE_URL}/${slug}/" />`)) {
      fail(`${slug}: canonical does not point at ${SITE_URL}/${slug}/`);
    }
    if (!/name="robots" content="index/.test(html)) fail(`${slug}: is not indexable`);
    // A guide exists to send its reader into the tool, and the link back to the
    // landing page is what keeps the two pages one site rather than two.
    if (!html.includes('href="/app/"')) fail(`${slug}: has no link to the app`);
    if (!/href="\/(#[a-z-]+)?"/.test(html)) fail(`${slug}: has no link back to the landing page`);
    if (html.includes('id="root"')) fail(`${slug}: looks like the app template`);
  }

  const routeMismatch = checkGuideRoutes();
  if (routeMismatch) fail(routeMismatch);

  // The measurement tags are written into every template by hand. Expo
  // re-serialises the app's HTML on export, so this asserts they actually
  // survived that — and a tag missing from one page would under-count the site
  // without ever looking broken.
  for (const [page, html] of [
    ['landing page', landing],
    ['app page', app],
    ...guides.map(({ slug, html }) => [slug, html]),
  ]) {
    const missing = missingTagReason(html);
    if (missing) fail(`${page}: ${missing}`);
  }

  // 5. A host that serves /app (no trailing slash) without redirecting would
  //    404. A copy at /app.html costs nothing and covers it — same per guide.
  writeFileSync(resolve(dist, 'app.html'), app, 'utf8');
  for (const { slug, html } of guides) writeFileSync(resolve(dist, `${slug}.html`), html, 'utf8');

  const paths = GUIDE_PAGES.map(({ slug }) => `/${slug}/`).join(', ');
  console.log(
    `build-site: landing at /, app at /app/, ${guides.length} guide(s) at ${paths} (${dist})`
  );
  console.log(
    `build-site: Google tag ${GA_MEASUREMENT_ID} and Clarity ${CLARITY_PROJECT_ID} on all pages`
  );
}

// Only build when run directly, so the test can import the constants above
// without moving files around.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  buildSite(resolve(root, process.argv[2] ?? 'dist'));
}
