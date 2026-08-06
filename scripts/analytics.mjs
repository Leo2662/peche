#!/usr/bin/env node
/**
 * Google Analytics 4 for pecheaubar.fr.
 *
 * The tag itself lives in the two page templates — `public/landing.html` and
 * `public/index.html` — as the standard `gtag.js` snippet, immediately after
 * `<head>`, exactly as Google hands it out. It is committed rather than
 * injected at build time: a tag that depends on a host environment variable is
 * a tag that is missing the day nobody sets it, and Tag Assistant reports
 * nothing more specific than "not detected".
 *
 * This module is what the build and the tests agree on: one measurement id, in
 * one place, so a page that quietly loses its tag fails the build instead of
 * the site.
 */

/** The GA4 property behind pecheaubar.fr. */
export const GA_MEASUREMENT_ID = 'G-VYBEV628Q0';

/** Substring that identifies a page carrying the loader. */
export const TAG_MARKER = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

/**
 * Everything the snippet must contain to be a working, detectable tag.
 *
 * Tag Assistant and the Realtime report only ever answer "detected" or not, so
 * the parts that make it work are pinned individually — a missing `config` or
 * a `dataLayer` that is set up after the first push both fail silently.
 */
export const TAG_REQUIREMENTS = [
  { name: 'the gtag.js loader, async', pattern: /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-VYBEV628Q0"><\/script>/ },
  { name: 'the dataLayer bootstrap', pattern: /window\.dataLayer = window\.dataLayer \|\| \[\]/ },
  { name: 'the gtag shim', pattern: /function gtag\(\)\s*\{\s*dataLayer\.push\(arguments\);?\s*\}/ },
  { name: "the gtag('js') call", pattern: /gtag\('js', new Date\(\)\)/ },
  { name: 'the config call for the property', pattern: /gtag\('config', 'G-VYBEV628Q0'\)/ },
];

/**
 * Why the tag is missing from `html`, or `null` when it is complete.
 *
 * Returns a reason rather than a boolean so the build and the tests can both
 * say which half of the snippet went missing.
 */
export function missingTagReason(html) {
  for (const { name, pattern } of TAG_REQUIREMENTS) {
    if (!pattern.test(html)) return `no ${name}`;
  }
  return null;
}
