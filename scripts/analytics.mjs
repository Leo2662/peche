#!/usr/bin/env node
/**
 * The Google Analytics 4 tag for pecheaubar.fr.
 *
 * The tag is *not* committed into `public/*.html`. It is injected into the
 * built pages by `scripts/build-site.mjs`, from `GA_MEASUREMENT_ID` in the
 * build environment. Two reasons:
 *
 *   - `expo start --web` and local `npm run build:web` runs get no tag at all,
 *     so development traffic never lands in the property.
 *   - The measurement id lives in one place — the host's environment — instead
 *     of being duplicated across the landing page and the app template.
 *
 * With `GA_MEASUREMENT_ID` unset the build is exactly what it was before, minus
 * a line of console output. A malformed value fails the build rather than
 * shipping a tag that silently collects nothing.
 */

/**
 * A GA4 measurement id: `G-` followed by the property's suffix.
 *
 * Google issues ten uppercase alphanumerics today, but has never promised that
 * length, so the bound is loose. It is tight enough for its real job: the id is
 * interpolated into a script, and this is what guarantees it cannot carry a
 * quote or an angle bracket.
 */
export const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,16}$/;

/** Substring that identifies an already-tagged page. */
export const TAG_MARKER = 'googletagmanager.com/gtag/js';

/**
 * The measurement id the build should use, or `null` when analytics are off.
 *
 * @throws if the variable is set to something that is not a measurement id —
 *   a typo should stop the build, not disable tracking for a month.
 */
export function readMeasurementId(env = process.env) {
  const raw = env.GA_MEASUREMENT_ID?.trim();
  if (!raw) return null;
  if (!MEASUREMENT_ID_PATTERN.test(raw)) {
    throw new Error(
      `GA_MEASUREMENT_ID is not a GA4 measurement id (expected G-XXXXXXXXXX): ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

/**
 * The `<head>` markup for the tag, indented to sit inside the page templates.
 *
 * The inline block comes before the loader on purpose. `gtag/js` is `async`, so
 * the inline script always runs first anyway, but writing it in this order
 * makes the requirement visible: consent defaults have to be in `dataLayer`
 * before the library processes anything, or the first hit goes out under the
 * wrong assumptions.
 */
export function analyticsTag(id) {
  if (!MEASUREMENT_ID_PATTERN.test(id)) {
    throw new Error(`not a GA4 measurement id: ${JSON.stringify(id)}`);
  }

  return `    <!-- Google Analytics 4. Injected at build time from GA_MEASUREMENT_ID
         by scripts/build-site.mjs — see scripts/analytics.mjs. -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      // Nothing on this site is used for advertising, so the ad grants stay
      // denied for good and Google Signals is off: the tag measures traffic
      // and nothing else.
      gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted'
      });
      gtag('js', new Date());
      gtag('config', '${id}', {
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
`;
}

/**
 * Return `html` with the tag added as the last thing in its `<head>`.
 *
 * @throws if the page has no head, or already carries a tag — both mean the
 *   build did something other than what this script assumes.
 */
export function injectAnalytics(html, id) {
  if (html.includes(TAG_MARKER)) {
    throw new Error('the page already carries a gtag — refusing to inject a second one');
  }

  const close = html.indexOf('</head>');
  if (close === -1) throw new Error('the page has no </head> to inject into');

  // Insert whole lines above `</head>` so the closing tag keeps its own
  // indentation and the result still reads like hand-written HTML.
  const lineStart = html.lastIndexOf('\n', close) + 1;
  return html.slice(0, lineStart) + analyticsTag(id) + html.slice(lineStart);
}
