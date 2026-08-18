import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { missingTagReason } from '../scripts/analytics.mjs';
import {
  ARTICLE_PAGES,
  checkEditorialRoutes,
  EDITORIAL_PAGES,
  GUIDE_PAGES,
} from '../scripts/build-site.mjs';
import { buildSitemap, isoDate, ROUTES, SITE_URL } from '../scripts/generate-sitemap.mjs';
import { DEFAULT_SPOT, isCalibrated } from '../src/config/spots';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (name: string) => readFileSync(resolve(PUBLIC_DIR, name), 'utf8');

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
    // The landing page, then one entry per editorial page. The app itself is
    // client-rendered and carries a noindex — listing it would be a soft-404.
    assert.equal(ROUTES[0].path, '/');
    assert.equal(ROUTES.length, 1 + EDITORIAL_PAGES.length);

    const slugs = EDITORIAL_PAGES.map(({ slug }) => slug);
    for (const route of ROUTES.slice(1)) {
      // `vercel.json` sets trailingSlash: true, so the slash-less form is a 308.
      assert.match(route.path, /^\/[a-z0-9-]+\/$/, `${route.path} is not a clean path`);
      const slug = route.path.slice(1, -1);
      assert.ok(slugs.includes(slug), `${route.path} has no page behind it`);
      assert.doesNotThrow(
        () => readFileSync(resolve(PUBLIC_DIR, `${slug}.html`)),
        `public/${slug}.html is missing`
      );
    }
  });

  it('agrees with the build about which pages exist', () => {
    // The two lists are edited by hand in different files; this is the check
    // that stops one of them being forgotten.
    assert.equal(checkEditorialRoutes(), null);
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
});

describe('the committed public/ files', () => {
  it('ships a sitemap matching what the generator produces', () => {
    const committed = read('sitemap.xml');
    const lastmod = committed.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    assert.ok(lastmod, 'the committed sitemap has no lastmod');

    // Same bytes as a fresh run with that date: catches a hand-edited file.
    assert.equal(committed, buildSitemap(lastmod));
  });

  it('points robots.txt at the sitemap and lets crawlers in', () => {
    const robots = read('robots.txt');
    assert.match(robots, /^Sitemap: https:\/\/pecheaubar\.fr\/sitemap\.xml$/m);
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Allow: \/$/m);
    // Blocking the bundle would stop Google rendering the page at all.
    assert.ok(!/^Disallow: \/_expo/m.test(robots));
  });

  it('agrees with landing.html on the domain', () => {
    const html = read('landing.html');
    assert.match(html, /<link rel="canonical" href="https:\/\/pecheaubar\.fr\/" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/pecheaubar\.fr\/" \/>/);

    // Every absolute URL the crawler is told to follow must be on our domain.
    // Only the head: the body legitimately links out (the Open-Meteo credit).
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.length > 0, 'landing.html has no head');
    for (const [, url] of head.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.ok(url.startsWith(DOMAIN), `${url} is not on the site domain`);
    }

    // The JSON-LD vocabulary is the one Google reads, and the entity it
    // describes is the site itself.
    const jsonLd = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)?.[1] ?? 'null'
    );
    assert.equal(jsonLd?.['@context'], 'https://schema.org');
    assert.equal(jsonLd?.url, `${DOMAIN}/`);
  });

  it('is a French page with the metadata an indexed page needs', () => {
    const html = read('landing.html');
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<meta property="og:locale" content="fr_FR" \/>/);
    assert.match(html, /hreflang="fr"/);
    assert.match(html, /hreflang="x-default"/);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    assert.ok(title.length > 0 && title.length <= 60, `title is ${title.length} chars`);

    const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
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
    const html = read('landing.html');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const description = html.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';

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
    const html = read('landing.html');
    assert.match(html, /property="og:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    // Without alt text the card is unreadable to a screen reader. The
    // attribute is wrapped across lines in the source, hence the \s+.
    assert.match(html, /property="og:image:alt"\s+content="[^"]{20,}"/);

    // Twitter needs the large card explicitly; it does not infer it.
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image" content="https:\/\/pecheaubar\.fr\/og-image\.png"/);

    // And the files have to be there, at the declared size.
    const og = readFileSync(resolve(PUBLIC_DIR, 'og-image.png'));
    assert.deepEqual(pngSize(og), { width: 1200, height: 630 }, 'og-image.png is the wrong size');
    assert.deepEqual(pngSize(readFileSync(resolve(PUBLIC_DIR, 'apple-touch-icon.png'))), {
      width: 180,
      height: 180,
    });
    assert.deepEqual(pngSize(readFileSync(resolve(PUBLIC_DIR, 'icon-512.png'))), {
      width: 512,
      height: 512,
    });
  });

  it('stops iOS turning scores and times into phone links', () => {
    // The screen is full of "19:10 – 21:00" and bare three-digit numbers.
    assert.match(read('index.html'), /name="format-detection" content="[^"]*telephone=no/);
  });

  it('has a manifest consistent with the page', () => {
    const html = read('landing.html');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);

    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.equal(manifest.lang, 'fr');
    // Someone who installs the app wants the tool, not the sales page.
    assert.equal(manifest.start_url, '/app/');
    assert.equal(manifest.scope, '/');
    // Must match the page, or the splash flashes a different colour.
    assert.equal(manifest.theme_color, '#030A12');
    assert.match(html, /name="theme-color" content="#030A12"/);

    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      const file = readFileSync(resolve(PUBLIC_DIR, icon.src.replace(/^\//, '')));
      const { width, height } = pngSize(file);
      assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} does not match its declared size`);
    }
  });

  it('keeps the mount point Expo injects the bundle into', () => {
    const html = read('index.html');
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /id="expo-reset"/);
  });

  /**
   * The landing page's hero card is a hand-drawn mock of the app's screen. It
   * names the default spot, so it is the one string on the site that can
   * silently contradict the app it is advertising.
   */
  it('mocks the app with the spot label the app actually shows', () => {
    assert.ok(
      read('landing.html').includes(DEFAULT_SPOT.label),
      `the hero card does not name the default spot as "${DEFAULT_SPOT.label}"`
    );
  });
});

/**
 * Every editorial page — the spot guides and the technique articles alike.
 *
 * These are the pages that actually rank: unlike the app they are real text a
 * crawler can read, and unlike the landing page they answer a question someone
 * types ("pêche au bar à Boulogne-sur-Mer", "quelle canne pour le bar"). What
 * follows is the contract they all sign, so the seventh page cannot be written
 * to a lower standard than the first.
 */
describe('every editorial page', () => {
  for (const { slug, subject } of EDITORIAL_PAGES) {
    const html = read(`${slug}.html`);
    const head = headOf(html);
    const url = `${DOMAIN}/${slug}/`;

    describe(slug, () => {
      it('claims its own path, and asks to be indexed', () => {
        assert.match(html, /<html lang="fr">/);
        assert.ok(head.length > 0, 'the page has no head');
        assert.ok(
          head.includes(`<link rel="canonical" href="${url}" />`),
          `canonical does not point at ${url}`
        );
        assert.match(head, /<meta name="robots" content="index, follow/);
        assert.ok(head.includes(`<meta property="og:url" content="${url}" />`));

        // Both alternates must land on this page, not on the site root — the
        // attributes are wrapped across lines in the source, hence the \s+.
        for (const lang of ['fr', 'x-default']) {
          const alternate = new RegExp(`hreflang="${lang}"\\s+href="([^"]+)"`).exec(head);
          assert.ok(alternate, `no ${lang} alternate`);
          assert.equal(alternate[1], url, `the ${lang} alternate points elsewhere`);
        }
        assert.match(head, /<meta property="og:locale" content="fr_FR" \/>/);
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

        const description = head.match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
        assert.ok(
          description.length >= 70 && description.length <= 160,
          `description is ${description.length} chars`
        );

        // A page that names neither its species nor its own subject is not a
        // page — it is the landing page with extra words.
        for (const field of [title, description]) {
          assert.match(field.toLowerCase(), /bar/, `"${field}" does not name the species`);
          assert.ok(
            field.toLowerCase().includes(subject.toLowerCase()),
            `"${field}" does not name ${subject}`
          );
        }
      });

      it('carries exactly one h1, naming its subject', () => {
        const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
        assert.equal(h1s.length, 1, 'a page with two h1s has no main heading');
        assert.ok(
          h1s[0][1].toLowerCase().includes(subject.toLowerCase()),
          `the h1 does not name ${subject}`
        );
      });

      /**
       * Internal linking is the whole reason these pages exist next to the
       * app: they collect the search traffic and hand it on. A page that links
       * nowhere is a leaf, and one nothing links to is an orphan.
       */
      it('links into the tool and back to the landing page', () => {
        assert.ok(html.includes('href="/app/"'), 'no link to the app');
        assert.ok(html.includes('href="/"'), 'no link back to the landing page');
        assert.ok(html.includes('href="/#comment"'), 'no deep link into the explanation');

        // …and the landing page links here, or the page is unreachable by
        // crawl from the site root.
        const landing = read('landing.html');
        assert.ok(
          landing.includes(`href="/${slug}/"`),
          `landing.html does not link to /${slug}/ — the page is an orphan`
        );

        // Every editorial page links to every other one. A hub-and-spoke with
        // no rim makes each of them a one-hop dead end from the root.
        for (const other of EDITORIAL_PAGES) {
          if (other.slug === slug) continue;
          assert.ok(
            html.includes(`href="/${other.slug}/"`),
            `${slug} does not link to /${other.slug}/`
          );
        }
      });

      it('ships structured data Google can read', () => {
        const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g)]
          .map(([, body]) => JSON.parse(body));

        assert.ok(blocks.length >= 2, 'a page should describe itself and its breadcrumb');
        for (const block of blocks) assert.equal(block['@context'], 'https://schema.org');

        const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
        assert.ok(breadcrumb, 'no BreadcrumbList');
        // The trail has to end on this page, or it describes someone else's.
        const trail = breadcrumb.itemListElement;
        assert.equal(trail[0].item, `${DOMAIN}/`);
        assert.equal(trail.at(-1).item, url);
        trail.forEach((step: { position: number; name?: string }, index: number) => {
          assert.equal(step.position, index + 1, 'breadcrumb positions are not 1-based and ordered');
          // A step with no name is a step Google prints as a blank crumb, and
          // the visible trail is built from the same string.
          assert.ok(step.name, `breadcrumb step ${index + 1} has no name`);
          assert.ok(
            html.includes(`<li>${step.name}</li>`) || html.includes(`>${step.name}</a>`),
            `the breadcrumb names "${step.name}" but the page does not show it`
          );
        });

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
 * What is true of a guide and of nothing else: it is about a stretch of coast,
 * and it has neighbours it can be confused with.
 */
describe('the spot guides', () => {
  for (const { slug, place } of GUIDE_PAGES) {
    const html = read(`${slug}.html`);
    const body = html.slice(html.indexOf('<h1'));

    describe(slug, () => {
      it('spells its place the way the build spells it', () => {
        // The shared contract matches case-insensitively so an article can name
        // a common noun; a place name has one spelling and this is it.
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
        const description = headOf(html).match(/name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
        for (const field of [title, description]) {
          assert.ok(field.includes(place), `"${field}" does not name ${place}`);
        }
        assert.ok(body.slice(0, body.indexOf('</h1>')).includes(place), 'the h1 misspells the place');
      });

      /**
       * Two spot guides built from the same template will read as near
       * duplicates unless each is actually written for its own coast. Google
       * calls that thin content and picks one to rank; the other is wasted.
       */
      it('is written for its own coast, not copied from a sibling', () => {
        for (const other of GUIDE_PAGES) {
          if (other.slug === slug) continue;
          // Naming a neighbour in a link or a comparison is the point of the
          // sibling section. Being *about* it is the failure.
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
 * The technique articles. An article has no coast to be held to, so what
 * replaces the geographic checks is the promise in its own title: a page that
 * says it covers length, power and action has to cover all three.
 */
describe('the technique articles', () => {
  for (const { slug, subject } of ARTICLE_PAGES) {
    const html = read(`${slug}.html`);
    const body = html.slice(html.indexOf('<h1'));

    describe(slug, () => {
      it('is about its subject rather than about the tool', () => {
        // The same rule the guides get, read the other way round: an article
        // that mentions a commune more often than its own subject is a guide
        // wearing the wrong title.
        const own = body.toLowerCase().split(subject.toLowerCase()).length - 1;
        assert.ok(own >= 10, `${slug} names ${subject} only ${own}× — that is not an article`);
        for (const { place } of GUIDE_PAGES) {
          const mentions = body.split(place).length - 1;
          assert.ok(own > mentions, `${slug} names ${place} ${mentions}× but ${subject} only ${own}×`);
        }
      });

      it('answers the three questions its heading asks', () => {
        // Longueur, puissance and action are the article's stated scope and its
        // three target queries. Each needs a section of its own, anchored and
        // headed by its own name — asserting the words merely appear in some h2
        // is satisfied by a single heading that lists all three, which is how
        // a page ends up promising three answers and giving one.
        for (const property of ['longueur', 'puissance', 'action']) {
          const section = new RegExp(`<section id="${property}"[^>]*>([\\s\\S]*?)</section>`).exec(
            body
          );
          assert.ok(section, `no <section id="${property}">`);

          const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(section[1]);
          assert.ok(heading, `the "${property}" section has no h2`);
          assert.ok(
            heading[1].toLowerCase().includes(property),
            `the "${property}" section is headed "${heading[1].trim()}"`
          );
        }
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
  const html = read('peche-bar-dunkerque.html');
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
