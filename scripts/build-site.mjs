#!/usr/bin/env node
/**
 * Compose the deployable site from an Expo web export.
 *
 * Expo puts the app at the root. The site wants the landing page there instead,
 * with the app one level down:
 *
 *   dist/index.html        the landing page (was public/landing.html)
 *   dist/app/index.html    the app          (was dist/index.html)
 *   dist/_expo/…           the bundle, referenced absolutely from /, so it
 *                          loads identically from either depth
 *
 * Run through `npm run build:web`, after `expo export`.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GA_MEASUREMENT_ID, missingTagReason } from './analytics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, process.argv[2] ?? 'dist');

function fail(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}

const appSource = resolve(dist, 'index.html');
const landingSource = resolve(dist, 'landing.html');

if (!existsSync(appSource)) fail(`no index.html in ${dist} — run expo export first`);
if (!existsSync(landingSource)) fail('no landing.html in the export — is public/landing.html there?');

// 1. Move the app to /app/.
const appDir = resolve(dist, 'app');
mkdirSync(appDir, { recursive: true });
renameSync(appSource, resolve(appDir, 'index.html'));

// 2. Promote the landing page to the root.
renameSync(landingSource, resolve(dist, 'index.html'));

// 3. Sanity-check the result rather than trusting the moves.
const landing = readFileSync(resolve(dist, 'index.html'), 'utf8');
const app = readFileSync(resolve(appDir, 'index.html'), 'utf8');

if (!landing.includes('href="/app/"')) fail('the landing page has no link to the app');
if (landing.includes('id="root"')) fail('the landing page looks like the app template');
if (!app.includes('id="root"')) fail('the app page lost its mount point');
if (!/src="\/_expo\//.test(app)) fail('the app page does not load the bundle from an absolute path');
if (!/noindex/.test(app)) fail('the app page should not be indexed — the landing page is');

// The Google tag is written into both templates by hand. Expo re-serialises
// the app's HTML on export, so this asserts the tag actually survived that —
// and a tag on only one of the two pages would under-count the site without
// ever looking broken.
for (const [page, html] of [
  ['landing page', landing],
  ['app page', app],
]) {
  const missing = missingTagReason(html);
  if (missing) fail(`the ${page} has an incomplete Google tag: ${missing}`);
}

// 4. A host that serves /app (no trailing slash) without redirecting would 404.
//    A copy at /app.html costs nothing and covers it.
writeFileSync(resolve(dist, 'app.html'), app, 'utf8');

console.log(`build-site: landing at /, app at /app/ (${dist})`);
console.log(`build-site: Google tag ${GA_MEASUREMENT_ID} on both pages`);
