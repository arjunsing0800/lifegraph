# LIFEGRAPH — Your Life, In Receipts

> "A life is more than what happened. It's what happened together."

Frontend-only interactive data-storytelling experience. Raw life receipts →
insights → connections → patterns → life moments → stories. No backend, no
database, no AI API — all analysis is deterministic and precomputed at build
time, then explored in the browser.

## Data pipeline

```
data/raw/*.csv ──▶ node scripts/build-data.mjs ──▶ public/data/*.json
   149,860 Spotify plays      normalize → sample → connect → cluster
     2,461 household rows       → patterns → stories
    10,267 augmented rows
```

Regenerate: `npm run data`

Key data-truth decisions (see `scripts/build-data.mjs`):

- Augmented transactions are **1,448 synthetic personas** — never linked to
  each other; they appear only as crowd context, capped below "strong".
- Augmented coordinates are **98.6% outside India** — excluded from all
  rendering; city/state kept as text. No map is rendered (deliberate).
- Household `Place N` codes are anonymized route context, never geocoded.
- Time-of-day is **IST** (protagonist is India-based); Spotify `ts` is UTC.
- Cross-source links are capped at 0.60 without a shared entity or place.

## Engine

Connection score = temporal proximity (40%) + place context (25%) +
shared entities (20%) + activity relationship (15%). Union-find clustering on
score ≥ 0.65 with 90-minute gap splitting. Every connection carries explainable
evidence powering the **WHY CONNECTED?** panel.

## Run / deploy

```sh
npm install
npm run data     # regenerate derived JSON (optional — committed under public/data)
npm run dev      # local dev
npm run build    # static dist/ — deploy to Vercel / Netlify / GitHub Pages as-is
```

## Experience — one continuous scroll film

Twelve cinematic acts on a single page, one sticky 3D universe:

`Opening → Receipts → Chaos→Order → Connections → A Moment → Why Connected →
Receipt Story → Pattern → Change → Discoveries → Explore → End`

Scroll drives camera, particle morph, connection reveal, and cluster focus.
Overlays (archive drawer with fuzzy search + link map, WHY CONNECTED panel)
open in place and return to the same scroll position. No routes.

The hero thread is real: on 29 Oct 2017 a 10-track Beatles session ends and,
61 seconds later, a 1-year Hotstar subscription is bought — presented as a
possible link (60%), with full component evidence, never overstated.
