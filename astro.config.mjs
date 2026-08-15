// @ts-check
import { defineConfig } from 'astro/config';

import { SITE_URL } from './site/data/guides.mjs';

/**
 * Astro builds the part of pecheaubar.fr a crawler reads: the landing page at
 * `/` and one editorial guide per spot. The app itself is still Expo — it is
 * exported separately and dropped into `dist/app/` by `scripts/merge-app.mjs`.
 *
 * The two builds share a project root, so they are kept out of each other's
 * way by directory:
 *
 *   site/         Astro sources        (srcDir — `src/` is the React Native app)
 *   site/public/  static files served at the root of the site
 *   public/       Expo's HTML template, which is what `public/` has always
 *                 meant here — Expo reads its web template from it, and it
 *                 keeps that job untouched
 *   dist/         both builds, merged
 *
 * `src/` is deliberately not Astro's: it holds the app's scoring engine and
 * React Native screens, which Metro bundles and Astro never sees. Astro's own
 * static files sit under `site/` for the same reason — so that neither build
 * has to be told to look somewhere unusual, and no npm script has to remember
 * an environment variable.
 */
export default defineConfig({
  site: SITE_URL,
  srcDir: './site',
  publicDir: './site/public',
  outDir: './dist',

  // The guides are served from clean paths (`/peche-bar-calais/`), which is
  // also what `vercel.json` declares with `trailingSlash: true`. Saying it
  // twice means the dev server and production disagree about nothing.
  trailingSlash: 'always',

  build: {
    format: 'directory',
    // These pages are sold on rendering before a network round trip, so their
    // CSS travels in the document rather than in a request the browser has to
    // discover and wait for. It is what the hand-written HTML did.
    inlineStylesheets: 'always',
  },

  // Nothing on these pages is interactive, so there is no client runtime to
  // ship and no island to hydrate.
  devToolbar: { enabled: false },
});
