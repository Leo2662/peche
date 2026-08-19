import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { missingTagReason } from '../scripts/analytics.mjs';
import { GUIDES, PAGES, pathOf, ROUTES, SITE_URL, subjectOf, TOPICS, urlOf } from '../site/data/guides.mjs';
import { buildSitemap, isoDate } from '../site/data/sitemap.mjs';
import { DEFAULT_SPOT, isCalibrated } from '../src/config/spots';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * These assertions are about the pages the site actually serves, so they read
 * the build rather than the sources. Astro composes each page out of a layout,
 * a stylesheet and a data file, and then minifies the result — none of which is
 * visible in `site/pages/`. What ships is what is worth testing.
 */
const DIST = resolve(ROOT, 'dist');

/** Static files Astro copies to the root of the site, verbatim. */
const STATIC = resolve(ROOT, 'site', 'public');

if (!existsSync(resolve(DIST, 'index.html'))) {
  throw new Error('nothing built — run `npm run build:site` first (`npm run check` does it for you)');
}

const built = (path: string) => readFileSync(resolve(DIST, path), 'utf8');
const asset = (name: string) => readFileSync(resolve(STATIC, name));

const landing = built('index.html');
const pageOf = (slug: string) => built(`${slug}/index.html`);

const DOMAIN = 'https://pecheaubar.fr';

/** The head is where the crawler-facing metadata lives, and only there. */
const headOf = (html: string) => html.slice(0, html.indexOf('</head>'));

/** Width and height straight out of a PNG's IHDR chunk. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', 'not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('sitemap generation', () => {
  it('points at the real domain', () => {
    assert.equal(SITE_URL, DOMAIN);
    assert.ok(!SITE_URL.endsWith('/'), 'SITE_URL must not end in a slash — paths add it');
  });

  it('lists only routes the site actually serves', () => {
    // The landing page, then one entry per editorial guide — the spot guides
    // and the topic guides alike. The app itself is client-rendered and carries
    // a noindex, so listing it would be a soft-404.
    assert.equal(ROUTES[0].path, '/');
    assert.equal(ROUTES.length, 1 + GUIDES.length + TOPICS.length);

    for (const route of ROUTES.slice(1)) {
      // `vercel.json` sets trailingSlash: true, so the slash-less form is a 308.
      assert.match(route.path, /^\/[a-z0-9-]+\/$/, `${route.path} is not a clean guide path`);
      assert.ok(
        existsSync(resolve(DIST, route.path.slice(1), 'index.html')),
        `${route.path} is in the sitemap but no page was built for it`
      );
    }
  });

  /**
   * The sitemap and the pages used to be two hand-written lists in two files,
   * with a build-time check that they still matched. Both now come from
   * `GUIDES`, so this asserts the property that check used to defend — that
   * every guide is announced, and nothing is announced that does not exist.
   */
  it('announces every guide, and only guides that were built', () => {
    const announced = ROUTES.slice(1).map((route) => route.path).sort();
    const registered = PAGES.map(({ slug }) => pathOf(slug)).sort();
    assert.deepEqual(announced, registered);
  });

  it('produces well-formed XML with the sitemaps.org namespace', () => {
    const xml = buildSitemap('2026-08-04');
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /<\/urlset>\s*$/);

    // Balanced tags, one <url> per route.
    for (const tag of ['url', 'loc', 'lastmod', 'changefreq']) {
      const open = xml.match(new RegExp(`<${tag}>`, 'g')) ?? [];
      const close = xml.match(new RegExp(`</${tag}>`, 'g')) ?? [];
      assert.equal(open.length, ROUTES.length, `<${tag}> count`);
      assert.equal(open.length, close.length, `<${tag}> is unbalanced`);
    }
  });

  it('emits absolute URLs, never relative paths', () => {
    const locs = [...buildSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, ROUTES.length);
    for (const loc of locs) {
      assert.ok(loc.startsWith(`${DOMAIN}/`), `${loc} is not an absolute URL on the domain`);
      assert.doesNotThrow(() => new URL(loc));
    }
  });

  it('dates in the W3C form the spec asks for', () => {
    assert.match(isoDate(new Date('2026-08-04T22:30:00Z')), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(isoDate(new Date('2026-08-04T22:30:00Z')), '2026-08-04');
    assert.match(buildSitemap(), /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('is served at /sitemap.xml, byte for byte what the builder produces', () => {
    const served = built('sitemap.xml');
    const lastmod = served.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    assert.ok(lastmod, 'the built sitemap has no lastmod');

    // The endpoint is a two-line wrapper around the builder; this is what says
    // it is still wired to it.
    assert.equal(served, buildSitemap(lastmod));
  });
});

describe('the built site', () => {
  it('points robots.txt at the sitemap and lets crawlers in', () => {
    const robots = built('robots.txt');
    assert.match(robots, /^Sitemap: https:\/\/pecheaubar\.fr\/sitemap\.xml$/m);
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Allow: \/$/m);
    // Blocking the bundle would stop Google rendering the page at all.
    assert.ok(!/^Disallow: \/_expo/m.test(robots));
  });

  it('agrees with the landing page on the domain', () => {
    assert.match(landing, /<link rel="canonical" href="https:\/\/pecheaubar\.fr\/">/);
    assert.match(landing, /<meta property="og:url" content="https:\/\/pecheaubar\.fr\/">/);

    // Every absolute URL the crawler is told to follow must be on our domain.
    // Only the head: the body legitimately links out (the Open-Meteo credit).
    // The measurement tags reach their vendors through `src=` and a JS string,
    // neither of which is a crawl instruction.
    const head = headOf(landing);
    assert.ok(head.length > 0, 'the landing page has no head');
    for (const [, url] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.ok(url.startsWith(DOMAIN), `${url} is not on the site domain`);
    }

    // The JSON-LD vocabulary is the one Google reads, and the entity it
    // describes is the site itself.
    const jsonLd = JSON.parse(
      landing.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)?.[1] ?? 'null'
    );
    assert.equal(jsonLd?.['@context'], 'https://schema.org');
    assert.equal(jsonLd?.url, `${DOMAIN}/`);
  });

  it('is a French page with the metadata an indexed page needs', () => {
    assert.match(landing, /<html lang="fr">/);
    assert.match(landing, /<meta property="og:locale" content="fr_FR">/);
    assert.match(landing, /hreflang="fr"/);
    assert.match(landing, /hreflang="x-default"/);

    const title = landing.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    assert.ok(title.length > 0 && title.length <= 60, `title is ${title.length} chars`);

    const description = landing.match(/name="description" content="([^"]+)"/s)?.[1] ?? '';
    assert.ok(
      description.length >= 70 && description.length <= 160,
      `description is ${description.length} chars`
    );
  });

  /**
   * The app's stated purpose is "prévoir les meilleures conditions de pêche au
   * bar", and the domain is built on that phrase. If the title and description
   * drift away from it, the meta tags stop doing their job.
   */
  it('states the purpose, in the words the domain is built on', () => {
    const title = landing.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const description = landing.match(/name="description" content="([^"]+)"/s)?.[1] ?? '';

    for (const field of [title, description]) {
      const text = field.toLowerCase();
      assert.match(text, /p[êe]che au bar/, `"${field}" does not name the subject`);
      assert.match(text, /pr[ée]vo/, `"${field}" does not state that it forecasts`);
      assert.match(text, /meilleure/, `"${field}" does not promise the best conditions`);
    }

    // The description should say what the score is built from, not just exist.
    assert.match(description.toLowerCase(), /mar[ée]e/);
    assert.match(description, /0 à 100/);
  });

  it('ships a share card the meta tags actually point at', () => {
    assert.match(landing, /property="og:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);
    assert.match(landing, /property="og:image:width" content="1200"/);
    assert.match(landing, /property="og:image:height" content="630"/);
    // Without alt text the card is unreadable to a screen reader.
    assert.match(landing, /property="og:image:alt" content="[^"]{20,}"/);

    // Twitter needs the large card explicitly; it does not infer it.
    assert.match(landing, /name="twitter:card" content="summary_large_image"/);
    assert.match(landing, /name="twitter:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);

    // And the files have to be there, at the declared size.
    assert.deepEqual(pngSize(asset('og-image.png')), { width: 1200, height: 630 });
    assert.deepEqual(pngSize(asset('apple-touch-icon.png')), { width: 180, height: 180 });
    assert.deepEqual(pngSize(asset('icon-512.png')), { width: 512, height: 512 });
  });

  it('has a manifest consistent with the page', () => {
    assert.match(landing, /<link rel="manifest" href="\/manifest\.webmanifest">/);

    const manifest = JSON.parse(built('manifest.webmanifest'));
    assert.equal(manifest.lang, 'fr');
    // Someone who installs the app wants the tool, not the sales page.
    assert.equal(manifest.start_url, '/app/');
    assert.equal(manifest.scope, '/');
    // Must match the page, or the splash flashes a different colour.
    assert.equal(manifest.theme_color, '#030A12');
    assert.match(landing, /name="theme-color" content="#030A12"/);

    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      const { width, height } = pngSize(asset(icon.src.replace(/^\//, '')));
      assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} does not match its declared size`);
    }
  });

  /**
   * The landing page's hero card is a hand-drawn mock of the app's screen. It
   * names the default spot, so it is the one string on the site that can
   * silently contradict the app it is advertising.
   */
  it('mocks the app with the spot label the app actually shows', () => {
    assert.ok(
      landing.includes(DEFAULT_SPOT.label),
      `the hero card does not name the default spot as "${DEFAULT_SPOT.label}"`
    );
  });

  it('carries both measurement tags, whole', () => {
    assert.equal(missingTagReason(landing), null);
  });
});

/**
 * The app's HTML template.
 *
 * Astro never sees this file: Expo reads it from `public/`, injects the bundle
 * into it and exports it to `/app/`. It is checked at the source because that
 * is where it is edited, and `scripts/merge-app.mjs` checks the exported result
 * again after Expo has re-serialised it.
 */
describe("the app's template", () => {
  const template = readFileSync(resolve(ROOT, 'public', 'index.html'), 'utf8');

  it('stops iOS turning scores and times into phone links', () => {
    // The screen is full of "19:10 – 21:00" and bare three-digit numbers.
    assert.match(template, /name="format-detection" content="[^"]*telephone=no/);
  });

  it('keeps the mount point Expo injects the bundle into', () => {
    assert.match(template, /<div id="root"><\/div>/);
    assert.match(template, /id="expo-reset"/);
  });

  it('asks not to be indexed, so the landing page ranks instead', () => {
    assert.match(template, /name="robots" content="noindex/);
  });

  it('carries both measurement tags, whole', () => {
    assert.equal(missingTagReason(template), null);
  });
});

/**
 * Every guide, whichever kind it is.
 *
 * These are the pages that actually rank: unlike the app they are real text a
 * crawler can read, and unlike the landing page they answer a question someone
 * types ("pêche au bar à Boulogne-sur-Mer", "quelle canne pour le bar du
 * bord"). What follows holds every guide to the same bar, so the seventh cannot
 * be written to a lower standard than the first.
 *
 * What is *not* here is what only one kind of guide can be held to — that a
 * spot page is written for its own coast, that a topic page delivers the three
 * axes it promises. Those follow, one describe each.
 */
describe('the guides', () => {
  for (const { slug } of PAGES) {
    const html = pageOf(slug);
    const head = headOf(html);
    const url = urlOf(slug);
    const { crumb, headline, about } = subjectOf(slug);

    describe(slug, () => {
      it('claims its own path, and asks to be indexed', () => {
        assert.match(html, /<html lang="fr">/);
        assert.ok(head.length > 0, 'the page has no head');
        assert.ok(
          head.includes(`<link rel="canonical" href="${url}">`),
          `canonical does not point at ${url}`
        );
        assert.match(head, /<meta name="robots" content="index, follow/);
        assert.ok(head.includes(`<meta property="og:url" content="${url}">`));

        // Both alternates must land on this page, not on the site root.
        for (const lang of ['fr', 'x-default']) {
          const alternate = new RegExp(`hreflang="${lang}" href="([^"]+)"`).exec(head);
          assert.ok(alternate, `no ${lang} alternate`);
          assert.equal(alternate[1], url, `the ${lang} alternate points elsewhere`);
        }
        assert.match(head, /<meta property="og:locale" content="fr_FR">/);
      });

      it('keeps every absolute URL in the head on our own domain', () => {
        for (const [, found] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
          assert.ok(found.startsWith(DOMAIN), `${found} is not on the site domain`);
        }
      });

      it('has a title and description sized for a search result', () => {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
        // Google truncates a title around 60 characters.
        assert.ok(title.length > 0 && title.length <= 60, `title is ${title.length} chars`);

        const description = head.match(/name="description" content="([^"]+)"/s)?.[1] ?? '';
        assert.ok(
          description.length >= 70 && description.length <= 160,
          `description is ${description.length} chars`
        );

        // A guide that does not name its species is not a guide — it is the
        // landing page with extra words.
        for (const field of [title, description]) {
          assert.match(field.toLowerCase(), /bar/, `"${field}" does not name the species`);
        }
      });

      it('carries exactly one h1, naming what the page is about', () => {
        const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
        assert.equal(h1s.length, 1, 'a page with two h1s has no main heading');
        // `crumb` is the place on a spot guide and the subject on a topic guide:
        // either way it is what the route table says the page is about, and the
        // one string a copy-paste from a sibling would leave behind. Compared
        // case-insensitively, because a breadcrumb label is capitalised and an
        // h1 may well name the same thing mid-sentence.
        assert.ok(
          h1s[0][1].toLowerCase().includes(crumb.toLowerCase()),
          `the h1 does not name "${crumb}"`
        );
      });

      /**
       * Internal linking is the whole reason a guide exists next to the app:
       * it collects the search traffic and hands it on. A guide that links
       * nowhere is a leaf, and one nothing links to is an orphan.
       */
      it('links into the tool, back to the landing page, and to every sibling', () => {
        assert.ok(html.includes('href="/app/"'), 'no link to the app');
        assert.ok(html.includes('href="/"'), 'no link back to the landing page');
        assert.ok(html.includes('href="/#comment"'), 'no deep link into the explanation');

        // …and the landing page links here, or the guide is unreachable by
        // crawl from the site root.
        assert.ok(
          landing.includes(`href="${pathOf(slug)}"`),
          `the landing page does not link to ${pathOf(slug)} — the guide is an orphan`
        );

        // The guides link to each other too — the footer sees to it. A
        // hub-and-spoke with no rim makes every guide a one-hop dead end from
        // the root.
        for (const other of PAGES) {
          if (other.slug === slug) continue;
          assert.ok(
            html.includes(`href="${pathOf(other.slug)}"`),
            `${slug} does not link to its sibling ${pathOf(other.slug)}`
          );
        }

        // And never to itself: a self-link in the footer is a wasted slot and
        // a crawl loop.
        assert.ok(
          !html.includes(`href="${pathOf(slug)}"`),
          `${slug} links to itself in its own footer`
        );
      });

      it('ships structured data Google can read', () => {
        const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g)]
          .map(([, body]) => JSON.parse(body));

        assert.ok(blocks.length >= 2, 'a guide should describe itself and its breadcrumb');
        for (const block of blocks) assert.equal(block['@context'], 'https://schema.org');

        const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
        assert.ok(breadcrumb, 'no BreadcrumbList');
        // The trail has to end on this page, or it describes someone else's.
        const trail = breadcrumb.itemListElement;
        assert.equal(trail[0].item, `${DOMAIN}/`);
        assert.equal(trail.at(-1).item, url);
        assert.equal(trail.at(-1).name, crumb, 'the breadcrumb does not name the subject');
        trail.forEach((step: { position: number }, index: number) => {
          assert.equal(step.position, index + 1, 'breadcrumb positions are not 1-based and ordered');
        });

        // The Article has to point at this page and carry this page's subject —
        // the fields a copy-paste between guides would leave behind.
        const article = blocks.find((block) => block['@type'] === 'Article');
        assert.ok(article, 'no Article');
        assert.equal(article.url, url);
        assert.equal(article.mainEntityOfPage, url);
        assert.equal(article.headline, headline, 'the headline is not the one the route table gives');
        assert.deepEqual(article.about, about, 'the Article is about someone else');

        const faq = blocks.find((block) => block['@type'] === 'FAQPage');
        assert.ok(faq, 'no FAQPage');
        assert.ok(faq.mainEntity.length >= 3, 'an FAQ of one or two is not worth marking up');
        for (const question of faq.mainEntity) {
          assert.ok(question.acceptedAnswer?.text?.length > 40, `"${question.name}" has no answer`);
          // Marking up an answer the visitor cannot see is what Google calls
          // hidden content, and penalises. The question must be on the page.
          assert.ok(
            html.includes(`<summary>${question.name}</summary>`),
            `"${question.name}" is in the structured data but not on the page`
          );
        }
      });

      it('shares the share card and the measurement tags', () => {
        assert.match(head, /property="og:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);
        assert.match(head, /name="twitter:card" content="summary_large_image"/);
        assert.equal(missingTagReason(html), null);
      });
    });
  }
});

/**
 * The per-spot guides, and what only they can be held to.
 *
 * A spot guide answers a question someone types with a place in it, so the
 * place is what it has to name — in its title, in its description, and more
 * often than any of its neighbours.
 */
describe('the spot guides', () => {
  for (const { slug, place } of GUIDES) {
    const html = pageOf(slug);
    const head = headOf(html);

    describe(slug, () => {
      it('names its place in the title and the description', () => {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
        const description = head.match(/name="description" content="([^"]+)"/s)?.[1] ?? '';
        for (const field of [title, description]) {
          assert.ok(field.includes(place), `"${field}" does not name ${place}`);
        }
      });

      it('announces its place in the schema headline', () => {
        assert.ok(
          subjectOf(slug).headline.includes(place),
          'the headline does not name the place'
        );
      });

      /**
       * Two spot guides built from the same template will read as near
       * duplicates unless each is actually written for its own coast. Google
       * calls that thin content and picks one to rank; the other is wasted.
       */
      it('is written for its own coast, not copied from a sibling', () => {
        for (const other of GUIDES) {
          if (other.slug === slug) continue;
          // Naming a neighbour in a link or a comparison is the point of the
          // sibling section. Being *about* it is the failure.
          const body = html.slice(html.indexOf('<h1'));
          const mentions = body.split(other.place).length - 1;
          const own = body.split(place).length - 1;
          assert.ok(
            own > mentions,
            `${slug} names ${other.place} ${mentions}× but ${place} only ${own}×`
          );
        }
      });
    });
  }
});

/**
 * The topic guides — the ones about tackle and technique rather than a stretch
 * of coast.
 *
 * They rank on searches no commune appears in, which is exactly why they are
 * the pages most likely to drift into generality: a page that answers "quelle
 * canne" without ever committing to a length, a casting weight or an action is
 * an article about nothing. So each is held to naming its own subject, and to
 * saying something specific about it.
 */
describe('the topic guides', () => {
  for (const topic of TOPICS) {
    const html = pageOf(topic.slug);
    const head = headOf(html);

    describe(topic.slug, () => {
      it('names its subject in the title and the description', () => {
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
        const description = head.match(/name="description" content="([^"]+)"/s)?.[1] ?? '';

        // The subject noun — "canne" for the rod guide — is the word someone
        // actually types. Both fields have to carry it, whatever else they say.
        const subject = topic.about.split(' ')[0].toLowerCase();
        for (const field of [title, description]) {
          assert.ok(
            field.toLowerCase().includes(subject),
            `"${field}" does not name its subject ("${subject}")`
          );
        }

        // And the title asks the page's own question, in the words the
        // breadcrumb and the sibling links use for it.
        assert.ok(
          title.toLowerCase().includes(topic.crumb.toLowerCase()),
          `the title does not ask "${topic.crumb}"`
        );
      });

      it('is about a subject, not about a coast', () => {
        const body = html.slice(html.indexOf('<h1'));
        for (const { place } of GUIDES) {
          // Naming a coast to say where a longer rod earns its keep, and again
          // in the links out, is what a topic guide is for. Naming one five
          // times is a spot guide wearing the wrong title, and it will compete
          // with the real one.
          const mentions = body.split(place).length - 1;
          assert.ok(mentions <= 4, `${topic.slug} names ${place} ${mentions}× — it reads as a spot guide`);
        }
      });

      it('answers with numbers, not with generalities', () => {
        const body = html.slice(html.indexOf('<h1'));
        // The failure mode of a tackle guide is the article that reads well and
        // commits to nothing — "choisissez une canne adaptée", "privilégiez un
        // leurre réaliste". A page that answers is thick with measurements: a
        // length, a weight, a diameter, a temperature. Which units it reaches
        // for is its own business; that it reaches for them is not.
        const measured = body.match(/\d+(?:[,.]\d+)?\s?(?:mm|cm|m|g|kg|°C|km\/h)\b/g) ?? [];
        assert.ok(
          measured.length >= 20,
          `${topic.slug} prints only ${measured.length} measurements — it answers in generalities`
        );
      });
    });
  }
});

/**
 * The Dunkerque guide publishes the app's wind sector table as a fact about
 * the spot. That is the one claim on the site that is a verbatim copy of a
 * constant in `src/`, so it is the one that can silently become a lie: change
 * `DUNKERQUE_WIND_SECTORS` and the page keeps advertising the old numbers.
 */
describe('the Dunkerque wind table', () => {
  const html = pageOf('peche-bar-dunkerque');
  const table = html.slice(html.indexOf('id="vent"'), html.indexOf('id="horaires"'));

  /** The scores as the page prints them: two decimals, French comma. */
  const printed = [...table.matchAll(/class="rank[^"]*">\s*([01],\d{2})/g)].map(([, value]) =>
    Number(value.replace(',', '.'))
  );

  it('is published at all, and only because the spot is calibrated', () => {
    assert.ok(isCalibrated(DEFAULT_SPOT), 'Dunkerque is no longer the calibrated spot');
    assert.ok(table.length > 0, 'the #vent section is gone');
    assert.ok(printed.length > 0, 'the wind table publishes no scores');
  });

  it('prints every distinct score the config holds, and invents none', () => {
    const sectors = DEFAULT_SPOT.windSectors;
    assert.ok(sectors, 'the default spot lost its wind sectors');

    for (const score of new Set(sectors)) {
      assert.ok(
        printed.includes(score),
        `the config scores a sector ${score} but the page never prints it`
      );
    }
    for (const value of printed) {
      assert.ok(sectors.includes(value), `the page prints ${value}, which is in no sector`);
    }
  });

  it('lists the sectors worst-last, so the bar chart reads down the page', () => {
    const descending = [...printed].sort((a, b) => b - a);
    assert.deepEqual(printed, descending, 'the wind table is not ordered best to worst');
  });
});
