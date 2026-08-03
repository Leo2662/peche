# BassScore

A single-screen mobile app that answers one question about one place:

> **Should I go fishing for sea bass at Dunkerque – Digue du Break right now?**

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
npm test           # 133 unit tests over the scoring engine
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
| 90 – 100 | CONDITIONS EXCELLENTES | green |
| 70 – 89 | BONNES CONDITIONS | yellow |
| 50 – 69 | CONDITIONS MOYENNES | red |
| 0 – 49 | MAUVAISES CONDITIONS | red |

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

## Architecture

```
src/
├── api/                    I/O only — no scoring logic
│   ├── http.ts             fetch with timeout, typed errors
│   ├── openMeteo.ts        weather + marine, normalised to SI units
│   ├── geocoding.ts        French place search
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
│   ├── factorMetrics.ts    the raw readings behind each factor
│   └── forecast.ts         timeline + per-day grouping
├── components/             ScoreDial, DayStrip, WindowList, WindowDetailSheet,
│                           ReasonDetail, FactorChart, SpotPicker,
│                           SpotFooter, ErrorState
├── screens/ScoreScreen.tsx the whole UI
├── hooks/                  useFishingScore (data), useSelectedDay (date),
│                           useSpot + usePlaceSearch (location),
│                           useCountUp (animation)
├── utils/                  math, time, series, moon, theme, cache, format
├── config/                 spots.ts, env.ts, strings.ts (all French copy)
└── types/                  shared domain types
```

The rule the layout enforces: **`src/scoring` never imports from `src/api`**
except for tide geometry helpers, and never touches the network or the clock.
`computeScore(inputs)` is deterministic, which is why the engine is covered by
133 tests that need no mocking framework.

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

Tapping the place name at the bottom of the screen opens a search over **any
place in France**, using Open-Meteo's geocoding index — free, keyless, and the
same provider the forecast comes from, so anything that can be found can be
scored. The choice is persisted; the app reopens where you left it.

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

133 tests, no mocking framework — the engine is pure, so the tests are just
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
