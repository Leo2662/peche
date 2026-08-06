#!/usr/bin/env node
/**
 * The measurement tags on pecheaubar.fr.
 *
 * Two of them, answering different questions:
 *
 *   - **Google Analytics 4** — how many people, arriving from where.
 *   - **Microsoft Clarity** — what they then do: scroll depth, rage clicks,
 *     dead clicks, session replay. On the landing page that says which sections
 *     get read; on the app it says whether the score, the day strip and the
 *     window list are understood without help.
 *
 * Both are the vendors' own snippets, committed into the two page templates —
 * `public/landing.html` and `public/index.html` — immediately after `<head>`.
 * Committed rather than injected at build time from an environment variable: a
 * tag that depends on a host setting is a tag that is missing the day nobody
 * sets it, and all the vendor consoles report back is "not detected".
 *
 * This module is the one place the ids live, and the list of parts each
 * snippet needs to actually work. `build-site.mjs` checks the built pages
 * against it, so a tag lost in Expo's export fails the build instead of
 * quietly leaving a hole in next month's reports.
 */

/** The GA4 property behind pecheaubar.fr. */
export const GA_MEASUREMENT_ID = 'G-VYBEV628Q0';

/** The Microsoft Clarity project behind pecheaubar.fr. */
export const CLARITY_PROJECT_ID = 'xy5pox99ey';

/** Vendor id shapes. Loose on length — neither vendor promises one — but tight
 *  enough to guarantee an id carries no quote or angle bracket, which is what
 *  makes it safe to sit inside a `<script>`. */
export const ID_PATTERNS = {
  ga: /^G-[A-Z0-9]{4,16}$/,
  clarity: /^[a-z0-9]{6,16}$/,
};

/** Substrings that identify a page carrying each loader. */
export const GA_TAG_MARKER = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
export const CLARITY_TAG_MARKER = 'https://www.clarity.ms/tag/';

/**
 * Everything each snippet must contain to be a working, detectable tag.
 *
 * A vendor console only ever answers "detected" or not, so the parts that make
 * a tag work are pinned one by one — a missing `config`, or a queue shim
 * installed after the loader has already run, both fail silently.
 */
export const TAGS = [
  {
    label: 'Google tag',
    id: GA_MEASUREMENT_ID,
    pattern: ID_PATTERNS.ga,
    requirements: [
      {
        name: 'gtag.js loader, async',
        pattern: /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-VYBEV628Q0"><\/script>/,
      },
      { name: 'dataLayer bootstrap', pattern: /window\.dataLayer = window\.dataLayer \|\| \[\]/ },
      { name: 'gtag shim', pattern: /function gtag\(\)\s*\{\s*dataLayer\.push\(arguments\);?\s*\}/ },
      { name: "gtag('js') call", pattern: /gtag\('js', new Date\(\)\)/ },
      { name: 'config call for the property', pattern: /gtag\('config', 'G-VYBEV628Q0'\)/ },
    ],
  },
  {
    label: 'Clarity tag',
    id: CLARITY_PROJECT_ID,
    pattern: ID_PATTERNS.clarity,
    requirements: [
      // The shim has to exist before clarity.ms loads, so calls made while the
      // script is in flight are queued rather than thrown away.
      { name: 'clarity queue shim', pattern: /c\[a\]\s*=\s*c\[a\]\s*\|\|\s*function\s*\(\)/ },
      { name: 'clarity.ms loader', pattern: /t\.src\s*=\s*"https:\/\/www\.clarity\.ms\/tag\/"\s*\+\s*i/ },
      { name: 'async load', pattern: /t\.async\s*=\s*1/ },
      {
        name: 'project id',
        pattern: new RegExp(`"clarity",\\s*"script",\\s*"${CLARITY_PROJECT_ID}"`),
      },
    ],
  },
];

/**
 * Why the tags are incomplete in `html`, or `null` when both are whole.
 *
 * Returns a reason rather than a boolean so the build and the tests can say
 * which tag, and which half of it, went missing.
 */
export function missingTagReason(html) {
  for (const tag of TAGS) {
    if (!tag.pattern.test(tag.id)) {
      return `the ${tag.label} has a placeholder id (${tag.id}) — put the real one in scripts/analytics.mjs and both page templates`;
    }
    for (const { name, pattern } of tag.requirements) {
      if (!pattern.test(html)) return `the ${tag.label} has no ${name}`;
    }
  }
  return null;
}
