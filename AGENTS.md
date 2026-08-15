# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Two builds, one repo

`src/` is the React Native app (Expo, Metro). `site/` is the website — the
landing page and the guides — and it is Astro 7. They meet only in `dist/`,
which `scripts/merge-app.mjs` assembles. See the *Web deployment* section of
the README before changing either build.

Nothing in `site/` may import from `src/` at build time except plain data: the
site is static HTML with no client JavaScript, and it must stay that way.
