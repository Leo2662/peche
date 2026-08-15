#!/usr/bin/env node
/**
 * Drop the Expo web export into the site Astro just built.
 *
 * Two builds, one directory. Astro owns everything a crawler reads — the
 * landing page at `/` and the guides — and Expo owns the tool. Expo exports the
 * app to the root of its own output, so this moves it down to `/app/` and
 * folds the rest of the export (the hashed bundle, the favicon) in alongside
 * the site:
 *
 *   dist/index.html              the landing page      (Astro)
 *   dist/peche-bar-<x>/          a guide               (Astro)
 *   dist/sitemap.xml             built from the routes (Astro)
 *   dist/app/index.html          the app               (Expo)
 *   dist/_expo/…                 the bundle, referenced absolutely from /,
 *                                so it loads identically from any depth
 *
 * Run through `npm run build:web`, which builds both halves first.
 *
 * This used to be `build-site.mjs`, which also had to shuffle the landing page
 * and every guide out of Expo's export and into place. Astro writes them where
 * they belong, so what is left is the app, and the checks — because a silent
 * failure here would publish the app at `/` under the landing page's meta tags,
 * which is the exact mistake worth catching in CI rather than in Search Console.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUIDES, pathOf, urlOf } from '../site/data/guides.mjs';
import { CLARITY_PROJECT_ID, GA_MEASUREMENT_ID, missingTagReason } from './analytics.mjs';

function fail(message) {
  console.error(`merge-app: ${message}`);
  process.exit(1);
}

function mergeApp(dist, exported) {
  if (!existsSync(dist)) fail(`no ${dist} — run astro build first`);
  if (!existsSync(exported)) fail(`no ${exported} — run expo export first`);

  const appSource = resolve(exported, 'index.html');
  if (!existsSync(appSource)) fail(`no index.html in ${exported} — did the web export run?`);

  // 1. The app moves to /app/; everything else Expo emitted — the bundle under
  //    _expo/, the favicon it generates from app.json — belongs at the root,
  //    which is where the app references it from.
  const appDir = resolve(dist, 'app');
  mkdirSync(appDir, { recursive: true });
  renameSync(appSource, resolve(appDir, 'index.html'));

  for (const entry of readdirSync(exported)) {
    cpSync(resolve(exported, entry), resolve(dist, entry), { recursive: true });
  }

  // 2. Check the result rather than trusting the moves.
  const app = readFileSync(resolve(appDir, 'index.html'), 'utf8');
  const landing = readFileSync(resolve(dist, 'index.html'), 'utf8');

  if (!app.includes('id="root"')) fail('the app page lost its mount point');
  if (!/src="\/_expo\//.test(app)) {
    fail('the app page does not load the bundle from an absolute path');
  }
  if (!/noindex/.test(app)) fail('the app page should not be indexed — the landing page is');
  if (landing.includes('id="root"')) fail('the landing page looks like the app template');
  if (!landing.includes('href="/app/"')) fail('the landing page has no link to the app');

  // 3. Every registered guide has to have been built, and has to point Google
  //    at the path it is actually served from.
  const guides = GUIDES.map(({ slug }) => {
    const page = resolve(dist, slug, 'index.html');
    if (!existsSync(page)) fail(`no page built for ${pathOf(slug)} — is site/pages/${slug}.astro there?`);
    const html = readFileSync(page, 'utf8');

    if (!html.includes(`<link rel="canonical" href="${urlOf(slug)}">`)) {
      fail(`${slug}: canonical does not point at ${urlOf(slug)}`);
    }
    if (!/name="robots" content="index/.test(html)) fail(`${slug}: is not indexable`);
    // A guide exists to send its reader into the tool, and the link back to the
    // landing page is what keeps the two pages one site rather than two.
    if (!html.includes('href="/app/"')) fail(`${slug}: has no link to the app`);
    if (!/href="\/(#[a-z-]+)?"/.test(html)) fail(`${slug}: has no link back to the landing page`);

    return { slug, html };
  });

  // 4. The measurement tags reach the app page through Expo, which re-serialises
  //    the HTML on export — so this asserts they actually survived that. A tag
  //    missing from one page would under-count the site without ever looking
  //    broken.
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

  const paths = GUIDES.map(({ slug }) => pathOf(slug)).join(', ');
  console.log(
    `merge-app: landing at /, app at /app/, ${guides.length} guide(s) at ${paths} (${dist})`
  );
  console.log(
    `merge-app: Google tag ${GA_MEASUREMENT_ID} and Clarity ${CLARITY_PROJECT_ID} on all pages`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  mergeApp(resolve(root, process.argv[2] ?? 'dist'), resolve(root, process.argv[3] ?? 'dist-expo'));
}
