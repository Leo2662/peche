# BassScore

A single-screen mobile app that answers one question about one place:

> **Should I go fishing for sea bass at Dunkerque – Digue du Break right now?**

You open it, you see a number from 0 to 100, and you know. There is no
dashboard, no chart, no menu, no login.

```
                87
        EXCELLENT CONDITIONS

            BEST WINDOW
           19:10 – 21:00

      Dunkerque · Digue du Break
```

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
npm test           # 62 unit tests over the scoring engine
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
Dunkerque): ≥ 90 % → 1.0, down to 0.3 for a small neap.

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
| 90 – 100 | EXCELLENT CONDITIONS | green |
| 70 – 89 | GOOD CONDITIONS | yellow |
| 50 – 69 | AVERAGE CONDITIONS | red |
| 0 – 49 | POOR CONDITIONS | red |

### Best window

The engine scores **every 10 minutes for the next 24 hours**, interpolating the
hourly API data (bearings as vectors, so 350° and 10° average to 0° and not
180°). It takes the peak, grows outwards while the score stays within 5 points
of it, and bounds the result to 45 minutes – 3 hours. That is what produces a
precise `19:10 – 21:00` rather than a vague "this evening".

---

## Architecture

```
src/
├── api/                    I/O only — no scoring logic
│   ├── http.ts             fetch with timeout, typed errors
│   ├── openMeteo.ts        weather + marine, normalised to SI units
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
│   ├── bestWindow.ts       peak detection over the score timeline
│   └── forecast.ts         everything the screen needs
├── components/             ScoreDial, BestWindowLabel, SpotFooter, ErrorState
├── screens/ScoreScreen.tsx the whole UI
├── hooks/                  useFishingScore (data), useCountUp (animation)
├── utils/                  math, time, series, moon, theme, cache
├── config/                 spots.ts, env.ts
└── types/                  shared domain types
```

The rule the layout enforces: **`src/scoring` never imports from `src/api`**
except for tide geometry helpers, and never touches the network or the clock.
`computeScore(inputs)` is deterministic, which is why the engine is covered by
62 tests that need no mocking framework.

### Data flow

```
launch
  └─ read AsyncStorage cache ──────────► show last known score immediately
  └─ Promise.all(weather, marine, tides)
        └─ buildForecast()
              ├─ buildInputs() every 10 min for 24 h
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
  then rendered in `Europe/Paris`. The score is correct on a phone set to any
  timezone — the tests run under `TZ=America/New_York` to prove it.

---

## The spot

Hardcoded in `src/config/spots.ts`:

```ts
{
  name: 'Dunkerque – Digue du Break',
  latitude: 51.05,
  longitude: 2.30,
  timezone: 'Europe/Paris',
  tidalUnitHeight: 2.75,   // SHOM "unité de hauteur", for the coefficient
  meanSpringRange: 5.5,    // m, normalises the tidal-range sub-score
}
```

---

## Testing

```bash
npm test
```

62 tests, no mocking framework — the engine is pure, so the tests are just
tables of inputs and expected outputs:

- every factor's bands, against the published spec
- the blend: all-perfect inputs → exactly 100, all-bad → under 30, garbage
  inputs → still inside 0–100, missing everything → 50 and `partial: true`
- tide geometry against a synthetic M2 curve: high water recovered to under
  15 minutes from hourly samples, amplitude to within 5 cm, alternating
  high/low, coefficient 100 at the mean spring range
- current estimated from the tide curve peaks at ≈1 m/s on a spring tide
- vector interpolation of wind bearings across the 0°/360° wrap
- best-window growth, minimum padding, and long-plateau trimming
- forecast round-trips through `JSON.stringify` (it must, to be cached)

---

## Deliberately not in the MVP

No login, no social features, no map, no chat, no profiles, no settings screen,
no articles. The product is: *open app → know if you should go fishing.*

## Ready for, but not built

The seams are already in place:

- **Multiple spots** — `Spot` is threaded through every layer and `SPOTS` is an
  array; adding a picker is a UI change only.
- **Other tide/data providers** — implement `TideProvider` and add it to the
  registry in `src/api/tides/index.ts`.
- **Species selection** — the factor thresholds are per-file constants
  (`IDEAL_SEA_TEMPERATURE`, `WAVE_HEIGHT_IDEAL`, the wind sector table), ready
  to be lifted into a species profile.
- **Catch reports / history / an AI model** — `ScoreResult` keeps every factor
  value and its sub-scores in `detail`, so each score is a labelled feature
  vector, and `Forecast` is already serialised to storage.
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
