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
 * Both pages then get the Google Analytics 4 tag, when `GA_MEASUREMENT_ID` is
 * set in the build environment.
 *
 * Run through `npm run build:web`, after `expo export`.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectAnalytics, readMeasurementId } from './analytics.mjs';

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

// 3. Tag both pages, when the host has an analytics property configured.
const landingPath = resolve(dist, 'index.html');
const appPath = resolve(appDir, 'index.html');

let measurementId = null;
try {
  measurementId = readMeasurementId();
} catch (error) {
  fail(error.message);
}

let landing = readFileSync(landingPath, 'utf8');
let app = readFileSync(appPath, 'utf8');

if (measurementId) {
  landing = injectAnalytics(landing, measurementId);
  app = injectAnalytics(app, measurementId);
  writeFileSync(landingPath, landing, 'utf8');
  writeFileSync(appPath, app, 'utf8');
}

// 4. Sanity-check the result rather than trusting the moves.
if (!landing.includes('href="/app/"')) fail('the landing page has no link to the app');
if (landing.includes('id="root"')) fail('the landing page looks like the app template');
if (!app.includes('id="root"')) fail('the app page lost its mount point');
if (!/src="\/_expo\//.test(app)) fail('the app page does not load the bundle from an absolute path');
if (!/noindex/.test(app)) fail('the app page should not be indexed — the landing page is');

// Analytics that only reach one of the two pages would under-count the site
// without ever looking broken, so both are checked rather than assumed.
if (measurementId) {
  if (!landing.includes(measurementId)) fail('the landing page lost its analytics tag');
  if (!app.includes(measurementId)) fail('the app page lost its analytics tag');
}

// 5. A host that serves /app (no trailing slash) without redirecting would 404.
//    A copy at /app.html costs nothing and covers it.
writeFileSync(resolve(dist, 'app.html'), app, 'utf8');

console.log(`build-site: landing at /, app at /app/ (${dist})`);
console.log(
  measurementId
    ? `build-site: Google Analytics 4 tag on both pages (${measurementId})`
    : 'build-site: no GA_MEASUREMENT_ID — built without analytics'
);
