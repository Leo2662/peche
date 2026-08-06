# BassScore

A single-screen mobile app for **surfcasting sea bass from the French coast**.
It answers one question:

> **Should I go surfcasting for sea bass right now?**

You open it, you see a number from 0 to 100, and you know. There is no
dashboard, no chart, no menu, no login.

```
   AUJ.   VEN. 31   SAM. 1   DIM. 2 …
    •        •         •        •

                87
        CONDITIONS EXCELLENTES
              MAINTENANT

            MEILLEUR CRÉNEAU
         19:10 – 21:00    97

      Dunkerque · Digue du Break
```

Today is always selected on open, so the two-second promise is untouched. Tap
any of the next 7 days to plan ahead: the ring then shows that day's **best**
score and the list shows every window worth fishing in it. Each day's dot is
coloured by its peak, so the whole week reads at a glance.

**The look is deep water.** The whole chrome — backgrounds, charts, day pills,
dividers, text — lives in a stack of deep blues, and turquoise is the brand
colour. See [Visual identity](#visual-identity).

**The interface is in French.** Every user-facing string lives in
`src/config/strings.ts`; dates, times and weekdays are formatted with `Intl`
using `fr-FR` and the spot's timezone. Exception messages are *not* translated
— they name endpoints and providers, so they go to the console and the screen
shows generic copy instead. Adding a second language means adding a sibling
object to that file, not touching the components.

---

## Quick start

```bash
npm install
npm start          # then scan the QR code with Expo Go
```

Platform shortcuts:

```bash
npm run ios
npm run android
npm run web
```

Checks:

```bash
npm run typecheck  # tsc --noEmit
npm test           # 177 unit tests over the scoring engine
npm run check      # both
```

**Requirements:** Node 20+, and the [Expo Go](https://expo.dev/go) app on your
phone (or a simulator).

---

## API keys

**None are required.** The default stack is entirely free and keyless:

| Data | Source | Key needed |
| --- | --- | --- |
| Wind, gusts, cloud cover, pressure | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | no |
| Waves, wave period, sea temperature | [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) | no |
| Tides (highs, lows, coefficient) | Open-Meteo `sea_level_height_msl`, peak-detected locally | no |
| Sunrise, sunset, moon phase | [SunCalc](https://github.com/mourner/suncalc), computed on device | no |
| Place search | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | no |

Open-Meteo is free for non-commercial use without registration. If you ship
this commercially, take one of their paid plans and point `FORECAST_ENDPOINT` /
`MARINE_ENDPOINT` in `src/api/openMeteo.ts` at the customer host.

### Optional: a station-grade tide provider

Tides derived from a sea-level model are accurate to a few minutes, which is
fine for a fishing index. If you want official harbour predictions instead, the
app ships a [WorldTides](https://www.worldtides.info/developer) provider:

```bash
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_WORLDTIDES_API_KEY=your_key_here
```

Restart the bundler. The registry picks WorldTides automatically because it has
the higher priority, and silently falls back to Open-Meteo if a request fails.
Force a specific one with `EXPO_PUBLIC_TIDE_PROVIDER=open-meteo`.

> `EXPO_PUBLIC_*` variables are **inlined into the JS bundle** — they are not
> secrets. Never put a private key in one.

---

## The Sea Bass Index

```
Score = 100 × (
  0.35 · BiologicalActivity +
  0.20 · TideWindow +
  0.15 · Wind +
  0.10 · Waves +
  0.08 · Light +
  0.07 · WaterTemperature +
  0.05 · Pressure
)
```

Every factor returns 0–1; the result is clamped to 0–100 and rounded. A factor
with no data contributes a neutral 0.5 rather than a zero, and the result is
flagged `partial`.

### 1. Biological activity — 35 %

`0.4 · Coefficient + 0.4 · Current + 0.2 · TidalRange`

| Tide coefficient | Score | | Current (m/s) | Score |
| --- | --- | --- | --- | --- |
| ≥ 100 | 1.0 | | 0.5 – 1.2 | 1.0 |
| 80 – 100 | 0.9 | | 0.2 – 0.5 | 0.6 |
| 60 – 80 | 0.75 | | > 1.2 | 0.7 |
| 40 – 60 | 0.5 | | < 0.2 | 0.3 |
| < 40 | 0.3 | | | |

Tidal range is scored against the spot's mean spring range (5.5 m at
Dunkerque): ≥ 90 % → 1.0, down to 0.3 for a small neap. For a searched spot
that reference is estimated from the observed sea-level curve rather than
assumed — see [The spot](#the-spot).

### 2. Tide window — 20 %

Distance from high water, signed (negative = before).

The three classic bass windows — the 2 h before high water, the hour after, and
the first 2 h of the ebb — union to **−2 h … +2 h**, which scores 1.0. Then 0.8
out to ±3 h, 0.5 out to ±4 h, and 0.2 beyond that (around low water).

### 3. Wind — 15 %

`0.6 · Direction + 0.4 · Speed`

Direction is tuned to Dunkerque's north-facing coast: **W / NW / SW = 1.0**,
N = 0.8, S = 0.6, **E = 0.3** (offshore, flattens and clears the water). NE and
SE interpolate between their neighbours.

This table is per-spot and does not generalise — see [The spot](#the-spot).
Somewhere the app has not been calibrated for, the direction term is dropped
entirely and the factor rests on speed alone.

Speed (km/h): 15–30 → 1.0 · 10–15 → 0.8 · 30–40 → 0.6 · < 10 → 0.5 · > 40 → 0.2

Gusts above 50 km/h damp the speed component by 30 % — a 25 km/h mean with
70 km/h gusts is not fishable off a dyke.

### 4. Waves — 10 %

Ideal is **0.5–1.5 m at 7–12 s**: enough swell to colour the water without
being wind chop. Both ideal → 1.0; both merely acceptable (0.3–2 m, 5–14 s) →
0.8; otherwise 0.3.

### 5. Light — 8 %

`0.7 · Twilight + 0.3 · Cloud`

Within 1 h of sunrise/sunset → 1.0; the second hour → 0.75; full darkness →
0.6; flat daylight → 0.35. Cloud cover ≥ 70 % → 1.0, falling to 0.45 under a
clear sky.

### 6. Water temperature — 7 %

`1 − |T − 16| / 12`, clamped to 0–1. Peaks at 16 °C, reaches zero at 4 °C and
28 °C.

### 7. Pressure — 5 %

Magnitude of the change over the previous 6 hours: ≤ 2 hPa → 1.0 (settled),
2–5 hPa → 0.7, > 5 hPa → 0.3 (a front is crossing).

### Verdict and colour

| Score | Verdict | Accent |
| --- | --- | --- |
| 90 – 100 | CONDITIONS EXCELLENTES | turquoise `#2FE0C8` |
| 70 – 89 | BONNES CONDITIONS | gold `#F5C63D` |
| 50 – 69 | CONDITIONS MOYENNES | coral `#F4677E` |
| 0 – 49 | MAUVAISES CONDITIONS | coral `#F4677E` |

### Best windows

The engine scores **every 10 minutes for the next 7 days**, interpolating the
hourly API data (bearings as vectors, so 350° and 10° average to 0° and not
180°). That timeline is then split into calendar days *in the spot's timezone*
and searched day by day, so a mediocre Tuesday still surfaces its own best
hours instead of being crowded out by a brilliant Friday.

Within a day, each pass takes the highest remaining peak and grows outwards
while the score stays within 5 points of it, then bounds the result to
45 minutes – 3 hours. That produces a precise `19:10 – 21:00` rather than a
vague "this evening". The whole plateau plus a 90-minute gap is then excluded,
so two tides give two windows rather than two halves of the same one.

Up to 3 windows are offered per day, and a secondary window is only kept if it
comes within 12 points of the day's best — otherwise a day with one outstanding
tide would also list the mediocre humps either side of it.

### Why a window is good

Tapping a window answers it in **one word per reason**, at most four:

```
              POURQUOI
            19:10 – 21:00

              · COURANT
              · MONTANTE
              · OUEST
              · CRÉPUSCULE
```

A reason has to be *favourable* (the factor is genuinely good, not merely
present — 0.7 and above) and it has to *matter*. Ranking is by `weight × value`,
not by value alone: that is why biological activity at 0.9 outranks pressure at
1.0, the first being worth 31 points and the second 5. Light is the lightest
factor that can still be a reason, so on a window where everything is perfect it
gets crowded out by the four heavier ones — correctly, since it is worth 8
points.

Each factor contributes its single most telling condition, taken from its
sub-scores: the tide says `MONTANTE` / `PLEINE MER` / `JUSANT`, biological
activity says `COURANT` or `VIVE-EAU` depending on which sub-score is carrying
it, light says `AUBE` / `CRÉPUSCULE` / `NUIT` / `COUVERT`. The vocabulary is the
one an angler uses on the dyke.

When nothing clears the threshold the two strongest are shown anyway — a
mediocre window is still the best one available, and saying nothing is worse
than saying what carried it.

`src/scoring/explain.ts` returns identifiers (`'flood'`, `'springTide'`), never
words. The engine holds no copy, and cached forecasts survive a rewording.

### The numbers behind a word

Tapping a word goes one level deeper: the raw reading, a curve, and the
supporting figures.

```
              ‹ RETOUR

              COURANT
             0,74 m/s

        ACTIVITÉ BIOLOGIQUE
       ╭──╮  ╭──╮  ╭──╮  ╭─
    ▓──╯  ╰──╯  ╰──╯  ╰──╯
    00:04   SUR LA JOURNÉE   23:04

    COEFFICIENT            98
    MARNAGE             4,7 m
```

The headline is the one figure that best explains the factor — the current in
m/s, the wind in km/h, the distance to high water as `1 h 49 avant`. The chart
plots the **factor** (0–1) across the day, with the window shaded and the peak
dotted, which answers *when* rather than *how much*.

Those are two different quantities, so the curve is labelled with the factor's
own name. Tapping `COURANT` shows `0,74 m/s` above a curve of *activité
biologique*; without the label that reads as a current graph, which it is not.

The y axis is pinned to 0–1 rather than scaled to the data: a factor that is
flat and excellent must look flat and high, not be stretched to fill the box and
suggest variation that is not there.

Numbers are French — comma decimals, `1 h 49`, `SO` for a south-westerly — and
`formatMetric` lives in `src/utils/format.ts`, outside the engine. The engine
reports numbers; formatting decides decimals and words.

Hourly factor curves are stored per day as parallel arrays of plain numbers.
The whole cached forecast is about 65 KB: 33 KB timeline, 20 KB peak
breakdowns, 4 KB curves.

### Why 7 days

That is the ceiling of the **marine** model (`forecast_days` of 1/3/5/7), which
supplies waves, sea temperature and the sea-level curve the tides are derived
from. The atmospheric endpoint would go to 16, but a day without sea state is
not a day this app can score honestly, so the horizon is set by the weaker
source.

---

## Web deployment — pecheaubar.fr

```bash
npm run build:web     # regenerates the sitemap, then exports to dist/
```

`public/` is copied verbatim to the root of `dist/`, and `public/index.html` is
the HTML template Expo injects the bundle into.

| File | Purpose |
| --- | --- |
| `public/landing.html` | the landing page — becomes `/` |
| `public/index.html` | the app's HTML template — becomes `/app/` |
| `public/sitemap.xml` | generated by `scripts/generate-sitemap.mjs` |
| `public/robots.txt` | allows everything, points at the sitemap |
| `public/manifest.webmanifest` | installable web app: name, colours, icons |
| `public/og-image.png` | 1200×630 share card |
| `public/icon-512.png`, `public/apple-touch-icon.png` | home-screen icons |
| `scripts/analytics.mjs` | the GA4 measurement id, and what a working tag needs |

### Landing page at `/`, tool at `/app/`

Two pages, because they have opposite jobs.

- **`/`** is plain HTML and CSS, no bundle. It renders before a network round
  trip, and it is the only part of the site a crawler can actually read: what
  the score is, the seven factors and their weights, how to read the colours,
  where the data comes from. This is the page that carries `index, follow`, the
  canonical, the `hreflang`s, the Open Graph card and the `WebApplication`
  JSON-LD.
- **`/app/`** is the tool. Its content is a number that changes hourly and only
  exists after JavaScript has run, so it is `noindex, follow` — *follow* so link
  equity still flows, *noindex* so Google is not asked to rank an empty shell.
  Its canonical points at itself, and its meta tags are trimmed to what a shared
  link needs.

Expo exports the app to the root, so `scripts/build-site.mjs` runs after
`expo export` and rearranges `dist/`:

```
dist/index.html      the landing page   (was public/landing.html)
dist/app/index.html  the app            (was dist/index.html)
dist/app.html        a copy of the app, for hosts that serve /app without
                     redirecting to /app/
dist/_expo/…         the bundle, referenced absolutely, so it loads the same
                     from either depth
```

The script does not trust its own moves. It exits non-zero if the landing page
has no `href="/app/"`, if the landing page still looks like the app template
(`id="root"`), if the app lost its mount point, if the app references the bundle
relatively, or if the app is not `noindex`. A silent failure here would publish
the app at `/` under the landing page's meta tags — the exact mistake worth
catching in CI rather than in Search Console.

`manifest.webmanifest` has `start_url: "/app/"` with `scope: "/"`. Someone who
installs the app to their home screen wants the tool, not the sales page; the
wider scope keeps the landing page inside the installed app so a back-link out
of the tool does not kick them into the browser.

### Deploying

`vercel.json` pins the two settings that decide what lands at `/`:

```json
{ "buildCommand": "npm run build:web", "outputDirectory": "dist" }
```

`expo export` on its own puts the **app** at `dist/index.html`. Only
`npm run build:web` runs `build-site.mjs` afterwards to swap it with the landing
page, so a host configured with the bare Expo preset — or with a build command
set once in a dashboard and never revisited — will keep serving the old site
with no error to show for it. The file is checked in so the setting travels with
the repo; `framework: null` stops Vercel's preset from overriding it.

The site is a pile of static files, so anything that serves a directory works.
The two rules: build with `npm run build:web`, publish `dist/`. And whatever the
host, the deployed branch has to be the one carrying these commits.

### Google Analytics 4

Property `G-VYBEV628Q0`. The standard `gtag.js` snippet, exactly as Google
hands it out, sits immediately after `<head>` in **both** page templates —
`public/landing.html` (which becomes `/`) and `public/index.html` (which
becomes `/app/` and its `/app.html` copy). GA4 reads the URL itself, so the two
appear as separate pages in the same property with no extra configuration.

It is committed into the templates rather than injected from a build-time
environment variable. A tag that depends on a host setting is a tag that is
missing the day nobody sets that variable, and the only thing Tag Assistant
reports back is *not detected* — no clue as to why. In the templates it travels
with the repo and is visible in a diff.

The cost of that choice is that `expo start --web` also fires the tag, so local
development shows up in the property. Filter it out with a *Developer traffic*
internal-traffic rule (Admin → Data Streams → Configure tag settings → Define
internal traffic) if it becomes noticeable.

`scripts/analytics.mjs` holds the measurement id and the five things the
snippet must contain to work: the async loader, the `dataLayer` bootstrap, the
`gtag` shim, `gtag('js')` and `gtag('config')`. `build-site.mjs` checks the
built output against that list and fails the build naming the missing part —
Expo re-serialises the app's HTML during export, and a page that quietly loses
its tag would otherwise only surface as a hole in the reports weeks later.

`tests/analytics.test.ts` pins the rest: the tag is complete on both pages,
immediately after `<head>` with nothing before it, present exactly once so hits
are not double-counted, loading `async` so it never blocks the render, and
naming no measurement id other than this one. It also checks the charset
declaration still lands inside the first 1024 bytes — the tag sits above
`<meta charset>`, and a declaration the parser finds too late is one it
ignores.

**On consent.** This is the plain snippet, so `ad_storage` and friends default
to granted and GA4 writes a first-party `_ga` cookie on arrival. The CNIL does
not treat GA4 as exempt from consent, so a French audience needs a banner
before the tag is compliant. The change when you add one is to declare consent
defaults ahead of the loader — `gtag('consent', 'default', { analytics_storage:
'denied', ad_storage: 'denied', … })` — and have the banner call
`gtag('consent', 'update', …)` when the visitor accepts.

### Meta tags

These live in `public/landing.html` — the indexed page.

Everything hangs off one sentence — *prévoir les meilleures conditions de pêche
au bar* — which is both the app's purpose and the phrase the domain is built on.

- **Title** (49 chars): `Prévoir les meilleures conditions de pêche au bar`.
  Short enough that Google shows it whole, leads with the verb, and carries the
  exact domain phrase. The brand is deliberately absent — at 60 characters it
  would have pushed out the words people actually search for, and `og:site_name`
  covers it for shares.
- **Description** (151 chars): states the promise, then what the score is built
  from — marée, vent, houle, lumière — and the coverage. A test pins both
  lengths and asserts they still contain *pêche au bar*, *prévo…* and
  *meilleure…*, so a rewrite cannot quietly drift off-subject.
- **Open Graph + Twitter**: full set with a real 1200×630 card, its declared
  dimensions, and alt text. `summary_large_image` is set explicitly — Twitter
  does not infer it.
- **`format-detection: telephone=no`**: the screen is full of `19:10 – 21:00`
  and bare three-digit scores, which iOS otherwise turns into phone links.
- **`max-image-preview:large`**, `hreflang` (`fr` + `x-default`), `canonical`,
  `theme-color` matching `PALETTE.abyss`, and the Apple web-app tags.

The share card and icons are rendered from `scripts/social-assets.html` — HTML
so the artwork stays versioned and editable rather than an opaque binary:

```bash
npm i -D playwright && npx playwright install chromium   # once
node scripts/generate-social-assets.mjs
```

Playwright is not a project dependency: it is only needed to regenerate artwork
that changes once a year, and the outputs are committed so a deploy never waits
on a browser.

### The sitemap has one URL, on purpose

`/` is the only page worth indexing. `/app/` is deliberately excluded: it is
`noindex`, and listing a page you have told Google not to index is a
contradiction it resolves by trusting neither signal. Listing spot pages —
`/dunkerque`, `/marseille` — would be worse still: soft-404s for URLs that do
not exist. `ROUTES` in the generator is the single place to add entries if real
URLs are ever introduced.

`lastmod` is generated at build time rather than committed by hand. A stale
`lastmod` is worse than none: crawlers learn to ignore the signal.

### What a sitemap can and cannot do here

It tells Google the site exists and when it changed. It cannot make a
client-rendered app rank, which is why the landing page exists at all: it is
static HTML with real prose about the subject, so there is something to index
before any JavaScript runs.

Beyond that, the next lever is not the sitemap — it is giving the app real URLs
(a page per spot, server-rendered with its tide table and conditions). That is a
different product, and the architecture is ready for it: `Spot` is already
threaded through every layer.

After deploying, submit `https://pecheaubar.fr/sitemap.xml` once in Google
Search Console. There is nothing to resubmit afterwards — one URL that does not
change.

---

## Visual identity

Deep water. Everything lives in `src/utils/theme.ts`.

```
PALETTE.surface  #0C2438   navy, the lit surface at the top of the screen
PALETTE.deep     #071726   mid water
PALETTE.abyss    #030A12   the floor of the screen, and the app background
PALETTE.sheet    #040D17   flat background for modal sheets

PALETTE.turquoise #2FE0C8  brand, and the top of the score scale
PALETTE.aqua      #4FB6D9  chrome that must not compete with the score
PALETTE.steel     #6E93AE  anything with no state to report
```

The background is a three-stop gradient that sinks from the lit surface to the
abyss, so the score sits in the light and the chrome falls away below it. The
top stop carries the current accent — but a constant wash of aqua goes in
first, because mixing amber straight into navy turned a good day olive, which
read as a different app entirely. Behind the number, a radial turquoise glow
adds depth without a blur filter, which `react-native-svg` renders unevenly on
Android.

### Why the score accents are not all blue

The three bands still have to be told apart at a glance, so they are three
colour families rather than three shades of the same blue: **turquoise** takes
over from green at the top, **gold** and **coral** are pitched to sit on deep
blue rather than on black. A test asserts they stay at least 45° apart in hue —
enough to separate turquoise, gold and red-pink, and enough to reject two
neighbouring blues, which is the failure mode it guards against.

Contrast is tested too: every accent clears 4.5:1 on the abyss and 3:1 on the
lit surface, and the primary text clears 7:1 on all three backgrounds. Text is
a cooled white (`#EAF6FA`) rather than pure white — on deep blue, pure white
reads as a different design system.

---

## Architecture

```
src/
├── api/                    I/O only — no scoring logic
│   ├── http.ts             fetch with timeout, typed errors
│   ├── openMeteo.ts        weather + marine, normalised to SI units
│   ├── geocoding.ts        coastal place search
│   ├── forecastRepository.ts   fans out the three calls concurrently
│   └── tides/              swappable tide providers
│       ├── types.ts            the TideProvider interface
│       ├── tideMath.ts         peak detection, coefficient, current estimate
│       ├── openMeteoTideProvider.ts  (default, keyless)
│       ├── worldTidesProvider.ts     (optional, API key)
│       └── index.ts            registry + fallback chain
├── scoring/                pure functions — no I/O, no clock
│   ├── factors/            one file per factor
│   ├── weights.ts          the published weights
│   ├── buildInputs.ts      raw series → ScoreInputs at an instant
│   ├── computeScore.ts     the index itself
│   ├── bestWindow.ts       window detection over a score timeline
│   ├── explain.ts          why a window is good, as reason ids
│   ├── coastalCheck.ts     is this place fishable, and which sea
│   ├── factorMetrics.ts    the raw readings behind each factor
│   └── forecast.ts         timeline + per-day grouping
├── components/             ScoreDial, DayStrip, WindowList, WindowDetailSheet,
│                           ReasonDetail, FactorChart, SpotPicker,
│                           SpotFooter, ErrorState
├── screens/ScoreScreen.tsx the whole UI
├── hooks/                  useFishingScore (data), useSelectedDay (date),
│                           useSpot + usePlaceSearch (location),
│                           useCountUp (animation)
├── utils/                  math, time, series, moon, theme, cache, format, geo
├── config/                 spots.ts, coastline.ts (coast + ICES areas),
│                           env.ts, strings.ts (all French copy)
└── ../public/              landing.html, index.html template, sitemap, robots,
                            manifest, share card and icons
└── types/                  shared domain types
```

The rule the layout enforces: **`src/scoring` never imports from `src/api`**
except for tide geometry helpers, and never touches the network or the clock.
`computeScore(inputs)` is deterministic, which is why the engine is covered by
177 tests that need no mocking framework.

### Data flow

```
launch
  └─ read AsyncStorage cache ──────────► show last known score immediately
  └─ Promise.all(weather, marine, tides)
        └─ buildForecast()
              ├─ buildInputs() every 10 min for 7 days
              ├─ computeScore() on each
              ├─ findBestWindow()
              └─ moon + next tides
        └─ render + write cache
```

### Behaviour

- **Refresh** every 30 minutes while open, plus on return to foreground if the
  data is older than that, plus pull-to-refresh.
- **Offline** shows the last cached score with a small `Offline · last update
  14:20` line. Only a cold start with no cache reaches the error screen.
- **Partial data** never blanks the screen: a missing variable falls back to a
  neutral 0.5 for that factor, and sub-scores re-normalise over what is present
  (a missing current does not drag biological activity to zero).
- **Timezones**: all API data is requested in UTC and parsed explicitly as UTC,
  then rendered in `Europe/Paris`. Days are split on midnight *in the spot's
  timezone*, never the device's, so the score and the date selector are correct
  on a phone set anywhere — the tests run under `TZ=America/New_York` to prove
  it.
- **Date selection costs no network**: all 7 days come from the same fetch, so
  switching days is instant and works offline. The selection is held as a date
  key rather than an index, so a background refresh that rolls midnight over
  keeps you on the date you chose instead of silently jumping a day.

---

## The spot

Tapping the place name at the bottom of the screen opens a search over the
**coastal towns of France**, using Open-Meteo's geocoding index. The choice is
persisted; the app reopens where you left it.

### Only places you can actually surfcast from

The app is for surfcasting: you stand on a beach and cast into the surf.
Searching an inland town has to return nothing, not a confident score built on
a sea that is not there.

Every geocoding result is checked against a coastline traced in
`src/config/coastline.ts` and rejected beyond **20 km** from the shore. It runs
on device, so an inland town never reaches the network and the user never waits
on a request that was doomed. Results are then ordered by distance to the water,
because that is the better surfcasting town.

The line is deliberately coarse — roughly 10 km between vertices, following the
open coast rather than every ria. That is the right resolution for the question
it answers, and it has a useful side effect: estuaries are cut across rather
than followed, so Bordeaux, Nantes and Rouen measure 30 km or more from the
line and are rejected. They are on tidal water, but you cannot surfcast there.

20 km keeps a coastal town whose centre sits a few kilometres back. Caen, for
instance, is 13 km out and kept — its beach is Ouistreham, a quarter of an hour
away. A test checks 34 real coastal towns and 22 inland cities.

### Fishing areas — ICES and GFCM

Each stretch of coast carries the stock assessment area it belongs to, shown
under every search result:

| Coast | Area | Tidal |
| --- | --- | --- |
| Dunkerque → Calais | CIEM 4.c, mer du Nord | yes |
| Calais → Cotentin | CIEM 7.d, Manche Est | yes |
| Cotentin → sud Finistère | CIEM 7.e, Manche Ouest | yes |
| Bretagne sud → Gironde | CIEM 8.a, Gascogne Nord | yes |
| Gironde → Hendaye | CIEM 8.b, Gascogne Sud | yes |
| Cerbère → Menton | CGPM GSA 7, Méditerranée | **no** |
| Corse | CGPM GSA 8 | **no** |

These are the divisions the northern and Biscay sea bass stocks are assessed
in, which is why they are the natural way to name a coast for this app. The
boundaries here are drawn at the nearest headland rather than at the offshore
meridians ICES actually uses — the shore-side equivalent, accurate to a few
tens of kilometres. Calais sits in the Dover Strait, exactly where 4.c meets
7.d, and the test accepts either.

`tidal: false` on the Mediterranean records something the score should
eventually act on: the range there is a few tens of centimetres, so the tide
factors — 55 % of the index — barely move. The spots are offered and the
estimated tidal scale keeps them from bottoming out, but a Mediterranean score
leans much harder on wind, waves and light than an Atlantic one.

### Why not SHOM

The SHOM is the right authority for French tides, and its harbour constants are
what `tidalUnitHeight` should come from everywhere rather than only at
Dunkerque. It is not wired in because there is **no free public API**: the tide
predictions and the port list are licensed products, and `data.shom.fr` needs
credentials. Adding it means a licence and a key, and it slots in behind the
existing `TideProvider` interface with no change to the engine.

### The coast check is not a data check

`checkCoastal` answers "is this on the coast". Whether the marine model
actually covers the point is a different question, and only the model can
answer it — an enclosed bay or a lagoon can be perfectly coastal and still have
no sea state. So `loadForecast` verifies that waves or a sea-level curve came
back, and raises `NoMarineDataError` if not. The screen then says **"Pas de
données marines ici"** rather than the generic failure, because retrying will
not help: the fix is to pick somewhere else.

The app ships pointing at, and calibrated for, one spot:

```ts
{
  name: 'Dunkerque – Digue du Break',
  latitude: 51.05,
  longitude: 2.30,
  timezone: 'Europe/Paris',
  tidalUnitHeight: 2.75,   // SHOM "unité de hauteur", for the coefficient
  meanSpringRange: 5.5,    // m, normalises the tidal-range sub-score
  windSectors: [...],      // which winds work on this shoreline
}
```

### What travels, and what does not

Three of the engine's inputs were tuned for Dunkerque, and they do not all
generalise. The picker shows **"Réglages estimés pour ce lieu"** whenever you
are somewhere the app has not been calibrated for.

**The tidal scale is estimated, and that matters.** `meanSpringRange` and
`tidalUnitHeight` are re-derived from the largest range in the actual forecast
window (`deriveTidalScale`). Reusing Dunkerque's 5.5 m on the Mediterranean —
where the range is a few tens of centimetres — would peg the tidal-range
sub-score to its floor and the coefficient to 20, permanently. The estimate is
crude: over 7 days it is decent near springs and an under-estimate near neaps,
so the coefficient it yields is relative to *that week* rather than the SHOM
scale. It is still far better than the alternative.

**Wind direction does not travel at all.** `windSectors` encodes which winds
push bait and coloured water against *this* shoreline; it cannot be derived
from coordinates, because it depends on the orientation of the coast and of the
structure you are standing on. A spot without a table is therefore scored on
**wind strength alone** — the direction sub-score drops out and the factor is
re-normalised, exactly like any other missing reading, and the result is flagged
`partial`.

That is a deliberate refusal to guess: at Dunkerque an easterly is the worst
wind there is, and applying that belief to a west-facing Atlantic beach would
produce a confidently wrong score. Adding a calibrated spot is a matter of
filling in the three fields in `src/config/spots.ts`.

Everything else — the tide window, waves, light, water temperature, pressure —
is physical rather than local, and applies anywhere.

---

## Testing

```bash
npm test
```

186 tests, no mocking framework — the engine is pure, so the tests are just
tables of inputs and expected outputs:

- every factor's bands, against the published spec
- the blend: all-perfect inputs → exactly 100, all-bad → under 30, garbage
  inputs → still inside 0–100, missing everything → 50 and `partial: true`
- tide geometry against a synthetic M2 curve: high water recovered to under
  15 minutes from hourly samples, amplitude to within 5 cm, alternating
  high/low, coefficient 100 at the mean spring range
- current estimated from the tide curve peaks at ≈1 m/s on a spring tide
- vector interpolation of wind bearings across the 0°/360° wrap
- window growth, minimum padding, and long-plateau trimming
- window separation: two tides give two windows, one plateau gives one, and a
  second window far below the day's best is dropped
- day grouping: split on midnight in `Europe/Paris` and not UTC, capped at the
  forecast horizon, days with no window kept rather than dropped
- every day's windows are chronological, separated, and inside their own day
- explanations: ranked by contribution and not raw value, at most four, one per
  factor, dawn told from dusk, the wind sector named only when the direction is
  what helps, and a mediocre window still explained rather than left blank
- metrics: the headline figure of each factor, missing readings dropped rather
  than shown as zero, French number formatting (comma decimals, `1 h 49 avant`,
  `SO` at 240° but `O` at 250°), signed pressure trends
- factor curves: hourly, in range, one per factor per day, aligned with the
  window they highlight, and the whole forecast still small enough to cache
- location: geocoding results mapped and filtered to France, short queries never
  sent, API and transport errors surfaced
- calibration: an uncalibrated spot is scored on wind strength alone and does
  not inherit Dunkerque's easterly penalty; its tidal scale is derived from the
  observed curve, which is what rescues the range sub-score on a microtidal
  coast (0.3 → 1.0 for the same 33 cm tide)
- identity: accents match the verdict bands exactly, stay 45° apart in hue,
  clear 4.5:1 on the abyss and 3:1 on the lit surface, and the background
  gradient always sinks rather than rising
- web: the sitemap is well-formed and absolute, the committed file matches a
  fresh generator run, and robots.txt, the canonical link and og:url all agree
  on the domain — every absolute URL in the landing page's head is on it, and
  the JSON-LD describes the site rather than something else
- meta tags: title and description within their length budgets and still on
  subject, og:image present at the dimensions it declares, manifest colours and
  icon sizes matching the page and the files on disk, `start_url` pointing at
  the tool rather than the landing page
- analytics: both pages carry the complete gtag.js snippet — loader, dataLayer,
  shim, `js` and `config` — immediately after `<head>` with nothing before it,
  exactly once, loaded `async`, naming no measurement id but ours, and with the
  charset declaration still inside the first 1024 bytes
- coastline: 34 real coastal towns accepted and placed in the right sea, 22
  inland cities rejected, estuary cities more than 30 km from the traced line,
  no gap between vertices wide enough to let a town slip through
- French formatting: times and dates rendered in `Europe/Paris` across a DST
  boundary, day pills labelled from the spot's timezone and not the device's,
  no empty copy, every template interpolating what it is given
- forecast round-trips through `JSON.stringify` (it must, to be cached)

---

## Deliberately not in the MVP

No login, no social features, no map, no chat, no profiles, no settings screen,
no articles. The product is: *open app → know if you should go fishing.*

## Ready for, but not built

The seams are already in place:

- **More calibrated spots** — the picker already reaches anywhere in France;
  what a spot gains by being added to `SPOTS` is its `windSectors` table and its
  SHOM tidal constants.
- **Other tide/data providers** — implement `TideProvider` and add it to the
  registry in `src/api/tides/index.ts`.
- **Species selection** — the factor thresholds are per-file constants
  (`IDEAL_SEA_TEMPERATURE`, `WAVE_HEIGHT_IDEAL`, the wind sector table), ready
  to be lifted into a species profile.
- **Catch reports / history / an AI model** — `ScoreResult` keeps every factor
  value and its sub-scores in `detail`, so each score is a labelled feature
  vector, and `Forecast` is already serialised to storage. `explainScore` turns
  that vector into ranked reasons, which is most of what an explanation layer
  over a trained model would need too.
- **Lure recommendations** — would key off the same `factors` breakdown.

---

## Notes on accuracy

- Currents come from the marine model where it publishes them; where it does
  not, they are estimated from the rate of change of sea level, calibrated so a
  Dunkerque spring tide peaks near 1.2 m/s. It is an estimate, and labelled as
  one in the code.
- The tidal coefficient is derived as `100 × semiRange / U` with `U = 2.75 m`
  for Dunkerque, then clamped to the conventional 20–120 scale.
- The weights, bands and thresholds encode angling heuristics, not a fitted
  model. They are all in one place precisely so they can be replaced by a
  trained one later.
