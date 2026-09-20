# LIFEGRAPH — Your Life, In Receipts

> **"A life is more than what happened. It's what happened together."**

**Live demo:** https://arjunsing0800.github.io/lifegraph/
**Source:** https://github.com/arjunsing0800/lifegraph

LIFEGRAPH is a frontend-only, zero-backend interactive data-storytelling project
that turns raw digital-life receipts — music listening history, household
purchases, and transaction streams — into one continuous cinematic story of
your life. Twelve acts scroll by on a single page while a real-time 3D
universe renders 9,649 life receipts as particles, morphs chaos into order,
draws connections between what happened, and eventually lets you explore the
whole graph yourself.

There is no database, no server, no AI API: every insight is deterministic,
computed once at build time, and explained with honest, inspectable evidence.

---

## 1. What it is

- **One page, twelve acts.** A single scroll drives the entire narrative:
  Opening → Receipts → Chaos→Order → Connections → A Moment → Why Connected →
  Receipt Story → Pattern → Change → Discoveries → Explore → End.
- **A living 3D universe.** The sticky WebGL background is not decoration —
  scroll literally moves the camera, fades in thousands of receipt particles,
  draws connection threads between them, and focuses constellations that tell
  true stories.
- **The ultimate kibbutz of effort** — every number is real.

## 2. The creative spark

The coolest moment in the story is a real one:

> On **29 October 2017**, a 10-track Beatles listening session ends, and
> **61 seconds later** a one-year Hotstar subscription is purchased.

On its own, Spotify history and a shopping bill look unrelated. Together,
they hint at a quiet domestic routine — headphones on, a screen turned on, a
subscription bought. LIFEGRAPH frames this honestly as a *possible* link
(scored ~60%), never overstated, with the full component evidence displayed in
the WHY CONNECTED? panel. That honesty — presenting what the data actually
supports instead of a confident narrative — is the design's superpower.

## 3. Key numbers (all precomputed from real data)

| Metric | Value |
|---|---|
| Full source corpus | 149,860 Spotify plays · 2,461 household rows · 10,267 augmented rows |
| Unified life receipts | **9,649** (4,688 music · 2,461 household purchases · 2,500 augmented) |
| Time covered | **12 years** (Jul 2013 – Dec 2024) |
| Connections found | **7,336** (≥ 0.55 similarity), top 3,000 shipped |
| Strong connections | 2,284 (≥ 0.65) |
| Clusters (life moments) | **271** |
| Recurring patterns | 7 |
| Full stories | 5 |
| Data on the wire | ~800 KB gzipped |

## 4. How it works

### 4.1 The data pipeline (build time, deterministic)

```
data/raw/*.csv ──▶ node scripts/build-data.mjs ──▶ public/data/*.json
                     normalize → sample → connect → cluster
                        → patterns → stories
```

Regenerate with `npm run data`. The script is **fully deterministic** — the
same inputs always produce byte-identical JSON, so the story never
"changes" between builds.

### 4.2 The connection engine

Each pair of life receipts is scored on four interpretable components:

- **Temporal proximity** — 40%
- **Place context** — 25%
- **Shared entities** (artists, merchants, people) — 20%
- **Activity relationship** music→movie, visit→purchase, etc. — 15%

Union-find clustering groups receipt graphs scoring ≥ 0.65 (with a 90-minute
gap splitter) into 271 *life moments*. Every connection ships with
human-readable evidence strings, which power the WHY CONNECTED? panel.

### 4.3 The experience layer (runtime, the browser)

- **React 19 + Vite 8 + TypeScript** for the single-page film.
- **Three.js / React Three Fiber** — a custom WebGL universe (`ReceiptUniverse`)
  painting ~10K receipt particles as instanced points, connection threads as
  lines, and cluster constellations. The camera is choreographed per scene via
  keyframes in `src/scenes/cameraStates.ts` (`VOID → DRIFT → REVEAL →
  THREADS → CONSTELLATION → FOCUS`).
- **GSAP + Lenis + Framer Motion** — buttery scroll, scroll-driven reveals,
  and word-level typographic animations, all gated behind
  `prefers-reduced-motion`.
- **d3-force + Fuse.js** — the Explore act's interactive link map (force
  layout, lazy-loaded) and fuzzy search over the whole 9,649-receipt archive.
- **Tailwind CSS v4** with a strict 6-color design system and Space Grotesk /
  Inter typography.

### 4.4 Honesty rules (non-negotiable)

- Augmented transactions are **1,448 synthetic personas** — they are never
  linked to each other, appearing only as crowd/context and capped below
  "strong" similarity.
- Augmented coordinates are 98.6% outside India — excluded from rendering;
  city/state kept as text only. **No map is rendered** (deliberate).
- Household `Place N` codes are anonymized route context — never geocoded.
- Time-of-day is **IST** (Indian protagonist); Spotify timestamps converted
  from UTC.
- Cross-source links are capped at 0.60 unless a shared entity or place
  exists.

### 4.5 Accessibility & performance

- Full keyboard + screen-reader support: ESC to close overlays, focus
  management, `sr-only` text, mobile bottom-sheet drawer.
- WebGL context-loss recovery with automatic re-render.
- `prefers-reduced-motion` global kill-switch.
- Single 1.4 MB JS bundle (lazy-loaded only for the graph).
- All 40 checklist items of the build pass; zero console errors in headless
  tests at 1440 / 768 / 390 px, dark & light, reduced-motion.

## 5. Getting started (run locally)

```sh
npm install
npm run dev      # http://localhost:5173
```

Production build:

```sh
npm run build    # tsc -b && vite build → dist/
npm run preview  # serve the build locally
```

Regenerate data (optional — derived JSON is committed):

```sh
npm run data
```

## 6. Deployment

`base: "./"` is set, so the build is path-agnostic. A GitHub Actions workflow
(`.github/workflows/deploy.yml`) builds and deploys every push to `main`:

- **Live:** https://arjunsing0800.github.io/lifegraph/
- Source maps / hashed assets are included and fingerprinted for caching.

Deploy the same `dist/` anywhere — Vercel, Netlify, Cloudflare Pages.

## 7. Project layout

```
scripts/build-data.mjs        # deterministic data pipeline (normalize→connect→cluster→patterns→stories)
src/engine/                   # types, connection scoring, evidence formatting
src/scenes/                   # ReceiptUniverse (R3F), cameraStates (camera choreography)
src/animation/sceneRanges.ts  # single map from scroll progress → scenes timing
src/hooks/                    # useData (shared fetch cache), useNarrativeProgress (Lenis+GSAP)
src/components/               # ExploreDrawer, ConnectionPanel, GraphView, Nav, ParallaxFigure, Typography
public/data/*.json            # generated artifacts (receipts, connections, clusters, patterns, stories, stats)
```

---

*"Thousands of fragments. But fragments can connect."*