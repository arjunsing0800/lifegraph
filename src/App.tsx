// LIFEGRAPH — one continuous scroll film. 12 acts, one sticky data universe.
// Scroll drives: camera, particle morph, connection reveal, cluster focus,
// story beats, evidence panels. No routes; overlays (archive drawer, WHY panel)
// open in place and return to the same scroll position.
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Search } from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ConnectionPanel from "./components/ConnectionPanel";
import ExploreDrawer from "./components/ExploreDrawer";
import Nav from "./components/Nav";
import ParallaxFigure from "./components/ParallaxFigure";
import { Fade, Words } from "./components/Typography";
import { scorePair } from "./engine/connections";
import { evidenceLines, fmtDateTime, strengthLabel } from "./engine/format";
import { TYPE_COLORS } from "./engine/types";
import type { ReceiptConnection } from "./engine/types";
import { useData } from "./hooks/useData";
import { useNarrativeProgress } from "./hooks/useNarrativeProgress";
import ReceiptUniverse from "./scenes/ReceiptUniverse";

const ACT_COUNT = 12;
const HERO_MOMENT_ID = "m-89";
const HERO_A = "sp-988"; // Dear Prudence — The Beatles, 21:53 IST, 29 Oct 2017
const HERO_B = "hh-873"; // Hotstar 1-yr subscription, 61 seconds later

class StageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="absolute inset-0" role="img" aria-label="Decorative starfield fallback"
          style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.16), transparent 60%), #08080d" }} />
      );
    }
    return this.props.children;
  }
}

// WebGL context-loss guard: if the GPU context dies mid-film, swap the canvas
// for an intentional branded still (story + evidence remain fully readable)
// with a retry that remounts the universe. Recovery: contextrestored clears it.
function StageGuard({ children, onRetry }: { children: (lost: boolean) => ReactNode; onRetry: () => void }) {
  const [lost, setLost] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const attach = (canvas: HTMLCanvasElement) => {
      const onLost = (e: Event) => { e.preventDefault(); setLost(true); };
      const onRestored = () => setLost(false);
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      return () => {
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
      };
    };
    let detach: (() => void) | null = null;
    const existing = root.querySelector("canvas");
    if (existing) detach = attach(existing);
    const obs = new MutationObserver(() => {
      if (detach) return;
      const c = root.querySelector("canvas");
      if (c) { detach = attach(c); obs.disconnect(); }
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => { obs.disconnect(); detach?.(); };
  }, []);
  return (
    <div ref={ref} className="absolute inset-0">
      {children(lost)}
      {lost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.14), transparent 60%), #08080d" }}>
          <div className="mono-meta text-violet-300">3D paused</div>
          <p className="max-w-sm text-sm text-stone-300">The graphics context was lost. The story and all evidence below remain fully readable.</p>
          <button onClick={() => { setLost(false); onRetry(); }} className="btn-ghost px-5 py-2 text-xs">Retry 3D</button>
        </div>
      )}
    </div>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  // canonical block reveal — delegates to the shared typography system
  return <Fade className={className} delay={delay} y={36}>{children}</Fade>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <div className="mono-meta mb-4 text-violet-300">{children}</div>;
}

function Headline({ children, className = "", words, rm = false }: { children?: ReactNode; className?: string; words?: string; rm?: boolean }) {
  if (words) {
    return (
      <div style={{ fontSize: "clamp(2.2rem, 6vw, 4.6rem)" }}>
        <Words as="h2" text={words} reducedMotion={rm}
          className={`font-display font-bold leading-[1.04] tracking-tight ${className}`}
        />
      </div>
    );
  }
  return (
    <h2 className={`font-display font-bold leading-[1.04] tracking-tight ${className}`}
      style={{ fontSize: "clamp(2.2rem, 6vw, 4.6rem)" }}>{children}</h2>
  );
}

export default function App() {
  const data = useData();
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const { progressRef, activeAct, registerAct } = useNarrativeProgress(ACT_COUNT, data.loaded, reducedMotion);
  const [navProgress, setNavProgress] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [openConn, setOpenConn] = useState<ReceiptConnection | null>(null);
  const [stageKey, setStageKey] = useState(0);
  // focus restoration: overlays return focus to whatever opened them
  const restoreRef = useRef<Element | null>(null);
  const restoreFocus = () => {
    const el = restoreRef.current as HTMLElement | null;
    if (el && document.contains(el)) el.focus();
    restoreRef.current = null;
  };
  const openDrawerFrom = () => { restoreRef.current = document.activeElement; setDrawer(true); };
  const closeDrawer = () => { setDrawer(false); restoreFocus(); };
  const openConnFrom = (c: ReceiptConnection) => { restoreRef.current = document.activeElement; setOpenConn(c); };
  const closeConn = () => { setOpenConn(null); restoreFocus(); };

  // deep link: #explore-open raises the archive immediately (also used by tests)
  useEffect(() => {
    if (data.loaded && location.hash === "#explore-open") openDrawerFrom();
  }, [data.loaded]);

  // thin progress hairline without re-rendering the universe per frame
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      const p = progressRef.current;
      if (Math.abs(p - last) > 0.003) { last = p; setNavProgress(p); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  // lock background scroll while an overlay is raised
  useEffect(() => {
    document.body.style.overflow = drawer || openConn ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawer, openConn]);

  const heroMoment = useMemo(() =>
    data.clusters.find((m) => m.id === HERO_MOMENT_ID) ??
    data.clusters.find((m) => m.categoryCount > 1) ?? data.clusters[0],
  [data.clusters]);

  const heroPair = useMemo(() => {
    const A = data.byId.get(HERO_A), B = data.byId.get(HERO_B);
    if (!A || !B) return null;
    return { A, B, scored: scorePair(A, B) };
  }, [data.byId]);

  const topLink = data.connections[0]; // strongest validated link (commute pair, 0.91)

  const eveningPairs = useMemo(() => {
    const p = data.patterns.find((x) => x.id === "p-evening-ritual");
    if (!p) return [];
    const out: { music: string; other: string; date: string }[] = [];
    for (let i = 0; i + 1 < p.evidenceReceiptIds.length && out.length < 3; i += 2) {
      const a = data.byId.get(p.evidenceReceiptIds[i]);
      const b = data.byId.get(p.evidenceReceiptIds[i + 1]);
      if (!a || !b) continue;
      const music = a.type === "music" ? a : b.type === "music" ? b : a;
      const other = music === a ? b : a;
      out.push({ music: music.title, other: other.title, date: fmtDateTime(music.timestamp).split(",").slice(0, 2).join(",") });
    }
    return out;
  }, [data.patterns, data.byId]);

  const taste = data.patterns.find((x) => x.id === "p-taste-shift");
  const tasteStory = data.stories.find((x) => x.id === "s-taste");

  const focusClusterId = activeAct >= 4 && activeAct <= 6 ? heroMoment?.id ?? null : null;
  const mobileConns = useMemo(() => data.connections.filter((c) => c.score >= 0.65).slice(0, 300), [data.connections]);

  if (!data.loaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="mono-meta text-violet-300">LIFEGRAPH</div>
        {data.error ? (
          <>
            <p className="font-display text-2xl font-bold">Unable to assemble the archive.</p>
            <p className="text-dim text-sm">{data.error}</p>
            <button onClick={() => location.reload()} className="btn-primary px-6 py-2.5 text-sm">Retry</button>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-bold">assembling traces…</p>
            <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full w-1/2 rounded-full bg-violet-500"
                animate={{ x: [0, 96, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} />
            </div>
          </>
        )}
      </div>
    );
  }

  const stats = data.stats;

  const act = (i: number, minH: string, inner: ReactNode, label: string) => (
    <section key={i} ref={registerAct(i)} data-act={label} id={`act-${i + 1}`} style={{ minHeight: minH }}
      className="relative z-10 mx-auto flex w-full max-w-5xl flex-col justify-center px-5 py-24 md:px-8" aria-label={label}>
      {inner}
    </section>
  );

  return (
    <div className="min-h-screen">
      {/* STICKY UNIVERSE — one canvas for the whole film */}
      <div className="fixed inset-0 z-0" aria-hidden>
        <StageErrorBoundary>
          <StageGuard onRetry={() => setStageKey((k) => k + 1)}>
            {(lost) => !lost && (
              <ReceiptUniverse key={stageKey} receipts={data.receipts} connections={isMobile ? mobileConns : data.connections} clusters={data.clusters}
                progressRef={progressRef} focusClusterId={focusClusterId} reducedMotion={reducedMotion} dpr={isMobile ? [1, 1.2] : undefined} />
            )}
          </StageGuard>
        </StageErrorBoundary>
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(4,4,8,0.55) 100%)" }} />
      </div>

      <Nav act={activeAct} actCount={ACT_COUNT} progress={navProgress} />

      <main className="relative">
        {/* ACT 01 — OPENING */}
        {act(0, "130vh", (
          <div className="text-center">
            <Reveal><div className="mono-meta mb-5 text-violet-300">your life, in receipts</div></Reveal>
            <Reveal delay={0.15}>
              <div style={{ fontSize: "clamp(3.4rem, 11vw, 8.5rem)" }}>
                <Words as="h1" text="LIFEGRAPH" stagger={0.09} reducedMotion={reducedMotion}
                  className="font-display font-bold tracking-tight glow-violet" />
              </div>
            </Reveal>
            <Reveal delay={0.3}><p className="mt-5 text-lg text-stone-300 md:text-xl">Every life leaves traces.</p></Reveal>
            <Reveal delay={0.45}>
              <p className="text-dim mt-2 flex items-center justify-center gap-2 text-sm">
                Scroll to uncover one <motion.span animate={reducedMotion ? {} : { y: [0, 7, 0] }} transition={{ repeat: Infinity, duration: 2 }}><ArrowDown size={15} /></motion.span>
              </p>
            </Reveal>
          </div>
        ), "Act 01 — Opening")}

        {/* ACT 02 — RECEIPTS */}
        {act(1, "150vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 02 · the receipts</Kicker></Reveal>
            <Reveal><Headline>{stats.totalReceipts.toLocaleString()} traces,<br />one digital life.</Headline></Reveal>
            <Reveal>
              <p className="text-dim mt-6 max-w-xl leading-relaxed">
                {stats.fullCorpus.spotifyPlays.toLocaleString()} songs played. {stats.fullCorpus.householdRows.toLocaleString()} household
                records. {stats.fullCorpus.augmentedRows.toLocaleString()} city transactions. Twelve years, 2013 → 2024 —
                each one a glowing point in the dark around you.
              </p>
            </Reveal>
            <Reveal>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                <span className="chip" style={{ color: TYPE_COLORS.music }}>🎵 music {stats.byType.music.toLocaleString()}</span>
                <span className="chip" style={{ color: TYPE_COLORS.purchase }}>🛍 purchases {stats.byType.purchase.toLocaleString()}</span>
                <span className="chip" style={{ color: TYPE_COLORS.movie }}>🎬 movies {stats.byType.movie}</span>
                <span className="chip" style={{ color: "#fb7185" }}>🎪 events {stats.byType.event}</span>
              </div>
            </Reveal>
          </div>
        ), "Act 02 — The receipts")}

        {/* ACT 03 — CHAOS → ORGANIZATION */}
        {act(2, "180vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 03 · organizing the chaos</Kicker></Reveal>
            <Reveal><Headline words="Thousands of fragments." rm={reducedMotion} /></Reveal>
            <Reveal><p className="text-dim mt-6 max-w-xl leading-relaxed">Watch them settle: position becomes time, height becomes hour of day, color becomes meaning. Nothing here is random — the spiral is eleven years long.</p></Reveal>
            <Reveal><Headline words="But fragments can connect." rm={reducedMotion} className="mt-14 text-violet-200" /></Reveal>
          </div>
        ), "Act 03 — Organizing the chaos")}

        {/* ACT 04 — CONNECTIONS */}
        {act(3, "150vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 04 · connections</Kicker></Reveal>
            <Reveal><Headline>{stats.connectionCount.toLocaleString()} hidden threads.</Headline></Reveal>
            <Reveal>
              <p className="text-dim mt-6 max-w-xl leading-relaxed">
                Time proximity, shared places, shared entities, related activities — scored deterministically,
                {stats.strongConnectionCount.toLocaleString()} of them strong. The brightest lines are already emerging.
              </p>
            </Reveal>
            {topLink && (
              <Reveal>
                <div className="card mt-6 max-w-xl p-4 text-sm">
                  <span className="mono-meta text-violet-300">strongest thread · {Math.round(topLink.score * 100)}%</span>
                  <p className="mt-2 leading-relaxed">{data.byId.get(topLink.receiptA)?.title} <span className="text-dim">⇄</span> {data.byId.get(topLink.receiptB)?.title}</p>
                </div>
              </Reveal>
            )}
          </div>
        ), "Act 04 — Connections")}

        {/* ACT 05 — A MOMENT */}
        {act(4, "160vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 05 · a moment</Kicker></Reveal>
            <Reveal><Headline words="A moment emerges." rm={reducedMotion} /></Reveal>
            {heroMoment && (
              <Reveal>
                <div className="card mt-6 max-w-xl p-5">
                  <div className="mono-meta text-dim">{heroMoment.receiptCount} receipts · {heroMoment.durationMinutes} minutes · {heroMoment.categoryCount} activity type</div>
                  <div className="font-display mt-1 text-2xl font-semibold">{heroMoment.title}</div>
                  <p className="text-dim mt-2 text-sm leading-relaxed">Sunday evening, 29 October 2017. Ten Beatles tracks in a row — and then, sixty-one seconds after the last note, something else happens.</p>
                </div>
              </Reveal>
            )}
          </div>
        ), "Act 05 — A moment")}

        {/* ACT 06 — WHY CONNECTED */}
        {act(5, "170vh", (
          <div className="mx-auto w-full max-w-xl">
            <Reveal><Kicker>act 06 · why connected</Kicker></Reveal>
            <Reveal><Headline words="Why are these connected?" rm={reducedMotion} className="mb-6" /></Reveal>
            {heroPair && (
              <div className="card p-5 md:p-6" role="group" aria-label="Why these two receipts are connected">
                <ReceiptMini id={heroPair.A.id} title={heroPair.A.title} meta={fmtDateTime(heroPair.A.timestamp)} color={TYPE_COLORS[heroPair.A.type]} type={heroPair.A.type} />
                <div className="my-1 flex items-center gap-3 pl-1 text-violet-300">
                  <span className="h-8 w-px bg-violet-400/60" />
                  <span className="mono-meta">61 seconds later</span>
                </div>
                <ReceiptMini id={heroPair.B.id} title={heroPair.B.title} meta={fmtDateTime(heroPair.B.timestamp)} color={TYPE_COLORS[heroPair.B.type]} type={heroPair.B.type} />
                <ul className="mt-4 space-y-2">
                  {evidenceLines({ ...{ receiptA: "", receiptB: "", id: "hero", score: heroPair.scored.score }, evidence: heroPair.scored.evidence } as ReceiptConnection).map((line, i) => (
                    <motion.li key={line} className="flex gap-2 text-sm leading-snug"
                      initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.18 }}>
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" /><span>{line}</span>
                    </motion.li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t hairline pt-3">
                  <span className="mono-meta text-dim">appears connected · {strengthLabel(heroPair.scored.score).toLowerCase()} link</span>
                  <span className="font-display text-3xl font-bold text-violet-200">{Math.round(heroPair.scored.score * 100)}%</span>
                </div>
                <p className="text-dim mt-2 text-[11px] leading-relaxed">Below the “strong” threshold — shown as it is, a possible thread, not a proven one. Temporal {heroPair.scored.evidence.temporal.score} · place {heroPair.scored.evidence.location.score} · entity {heroPair.scored.evidence.entity.score} · activity {heroPair.scored.evidence.category.score}.</p>
              </div>
            )}
          </div>
        ), "Act 06 — Why connected")}

        {/* ACT 07 — RECEIPT STORY */}
        {act(6, "230vh", (
          <div className="mx-auto w-full max-w-xl">
            <Reveal><Kicker>act 07 · the story, receipt by receipt</Kicker></Reveal>
            <Reveal><Headline className="mb-8">Ten songs,<br />then a decision.</Headline></Reveal>
            {heroMoment && (
              <ol className="relative space-y-0 border-l hairline pl-5">
                {heroMoment.receiptIds.map((id, i) => {
                  const r = data.byId.get(id);
                  if (!r) return null;
                  return (
                    <Reveal key={id} className="relative pb-5">
                      <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[r.type] }} />
                      <div className="mono-meta" style={{ color: TYPE_COLORS[r.type] }}>{String(i + 1).padStart(2, "0")} · {r.type}</div>
                      <div className="text-[15px] font-medium leading-snug">{r.title}</div>
                      <div className="text-dim text-xs">{fmtDateTime(r.timestamp)}</div>
                    </Reveal>
                  );
                })}
                {heroPair && (
                  <Reveal className="relative pb-2">
                    <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <div className="card border-emerald-400/30 p-4">
                      <div className="mono-meta text-emerald-300">61 seconds later · purchase</div>
                      <div className="text-[15px] font-medium leading-snug">{heroPair.B.title}</div>
                      <div className="text-dim text-xs">{fmtDateTime(heroPair.B.timestamp)} · a 1-year Hotstar subscription, bought inside a Beatles session</div>
                    </div>
                  </Reveal>
                )}
              </ol>
            )}
          </div>
        ), "Act 07 — Receipt story")}

        {/* ACT 08 — PATTERN */}
        {act(7, "170vh", (
          <div className="max-w-4xl">
            <Reveal><Kicker>act 08 · the pattern</Kicker></Reveal>
            <Reveal><Headline words="A recurring pattern appears." rm={reducedMotion} /></Reveal>
            <Reveal>
              <p className="text-dim mt-6 max-w-xl leading-relaxed">
                Music evenings with purchases nearby — {data.patterns.find((p) => p.id === "p-evening-ritual")?.supportingStats.eveningLinks} links
                across {data.patterns.find((p) => p.id === "p-evening-ritual")?.supportingStats.distinctDates} distinct dates.
                Repetition is the evidence:
              </p>
            </Reveal>
            <div className="mt-6 space-y-3">
              {eveningPairs.map((p, i) => (
                <Reveal key={i} delay={i * 0.1}>
                  <div className="card flex items-center gap-3 p-4 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS.music }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.music}</span>
                    <span className="text-dim shrink-0">→</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TYPE_COLORS.purchase }} />
                    <span className="min-w-0 flex-1 truncate text-stone-300">{p.other}</span>
                    <span className="text-dim hidden shrink-0 text-xs md:block">{p.date}</span>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <ParallaxFigure src={`${import.meta.env.BASE_URL}assets/repeat-motif.svg`} alt="Repeating music-to-purchase motif"
                caption="Original plate — repetition as evidence, not decoration." className="mt-8" reducedMotion={reducedMotion} />
            </Reveal>
          </div>
        ), "Act 08 — The pattern")}

        {/* ACT 09 — CHANGE */}
        {act(8, "160vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 09 · change over time</Kicker></Reveal>
            <Reveal><Headline words="The sound moved on." rm={reducedMotion} /></Reveal>
            {taste && tasteStory && (
              <>
                <Reveal><p className="text-dim mt-6 max-w-xl leading-relaxed">{tasteStory.description}</p></Reveal>
                <Reveal>
                  <div className="mt-6 space-y-4" role="img" aria-label={`Early period ${taste.supportingStats.earlyPlays} plays, later period ${taste.supportingStats.latePlays} plays, top-5 overlap ${taste.supportingStats.top5Overlap} of 5`}>
                    <Bar label="2015–16 plays" value={Number(taste.supportingStats.earlyPlays)} max={Math.max(Number(taste.supportingStats.earlyPlays), Number(taste.supportingStats.latePlays))} color="#8b5cf6" />
                    <Bar label="2017–18 plays" value={Number(taste.supportingStats.latePlays)} max={Math.max(Number(taste.supportingStats.earlyPlays), Number(taste.supportingStats.latePlays))} color="#22d3ee" />
                    <div className="card inline-block p-4"><span className="mono-meta text-dim">top-5 artist overlap</span>
                      <div className="font-display text-3xl font-bold">{String(taste.supportingStats.top5Overlap)} / 5</div></div>
                  </div>
                </Reveal>
              </>
            )}
          </div>
        ), "Act 09 — Change over time")}

        {/* ACT 10 — DISCOVERIES */}
        {act(9, "260vh", (
          <div className="max-w-3xl">
            <Reveal><Kicker>act 10 · discoveries</Kicker></Reveal>
            <Reveal><Headline className="mb-10">One discovery.<br />Then another.</Headline></Reveal>
            <div className="space-y-14">
              {data.stories.map((s, i) => (
                <Reveal key={s.id}>
                  <article>
                    <div className="font-display text-6xl font-bold text-white/10">0{i + 1}</div>
                    <div className="mono-meta mt-1 text-cyan-300">{s.patternType} · {s.receiptIds.length} receipts{s.clusterIds.length > 0 ? ` · ${s.clusterIds.length} moments` : ""}</div>
                    <h3 className="font-display mt-1 text-3xl font-semibold">{s.title}</h3>
                    <p className="text-dim mt-2 max-w-xl leading-relaxed">{s.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {s.evidence.map((e) => <span key={e.label} className="chip">{e.label}: <b className="text-white">{e.value}</b></span>)}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        ), "Act 10 — Discoveries")}

        {/* ACT 11 — EXPLORE */}
        {act(10, "140vh", (
          <div className="text-center">
            <Reveal><Kicker>act 11 · explore</Kicker></Reveal>
            <Reveal><Headline words="The archive is open." rm={reducedMotion} /></Reveal>
            <Reveal><p className="text-dim mx-auto mt-5 max-w-md text-sm leading-relaxed">Search every receipt, filter by type and source, open any link to see exactly why it exists. The drawer closes back to this exact spot.</p></Reveal>
            <Reveal>
              <button onClick={openDrawerFrom} className="btn-primary mx-auto mt-7 flex items-center gap-2 px-7 py-3.5 text-sm">
                <Search size={16} /> Open the archive
              </button>
            </Reveal>
          </div>
        ), "Act 11 — Explore")}

        {/* ACT 12 — END */}
        {act(11, "130vh", (
          <div className="text-center">
            <Reveal><p className="font-display text-2xl font-semibold md:text-3xl">Thousands of receipts.</p></Reveal>
            <Reveal><p className="font-display mt-2 text-2xl font-semibold text-stone-400 md:text-3xl">Hundreds of moments.</p></Reveal>
            <Reveal><p className="font-display mt-2 text-2xl font-semibold text-violet-200 md:text-3xl">A few stories.</p></Reveal>
            <Reveal>
              <ParallaxFigure src={`${import.meta.env.BASE_URL}assets/quiet-field.svg`} alt="Quiet field of fading traces"
                className="mx-auto mt-10 max-w-2xl" reducedMotion={reducedMotion} />
            </Reveal>
            <Reveal>
              <div className="font-display mt-10 text-xl font-bold tracking-tight">LIFE<span className="text-violet-400">GRAPH</span></div>
              <p className="text-dim mx-auto mt-2 max-w-sm text-sm">“A life is more than what happened.<br />It’s what happened together.”</p>
              <button onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })}
                className="btn-ghost mx-auto mt-6 flex items-center gap-2 px-6 py-2.5 text-sm">
                <ArrowUp size={15} /> Scroll back. Find another.
              </button>
            </Reveal>
          </div>
        ), "Act 12 — The end")}
      </main>

      <ExploreDrawer open={drawer} onClose={closeDrawer} onOpenConnection={openConnFrom} />
      <AnimatePresence>
        {openConn && (
          <ConnectionPanel key="conn" connection={openConn}
            moment={data.clusters.find((m) => m.connectionIds.includes(openConn.id)) ?? null}
            onClose={closeConn} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ReceiptMini({ title, meta, color, type }: { id: string; title: string; meta: string; color: string; type: string }) {
  return (
    <div className="rounded-lg border hairline bg-white/[0.03] p-3">
      <div className="mono-meta mb-1" style={{ color }}>{type}</div>
      <div className="text-sm font-medium leading-snug">{title}</div>
      <div className="text-dim mt-1 text-xs">{meta}</div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mono-meta text-dim mb-1.5">{label} · {value.toLocaleString()}</div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full" style={{ background: color }}
          initial={{ width: 0 }} whileInView={{ width: `${Math.max(4, (value / max) * 100)}%` }}
          viewport={{ once: true }} transition={{ duration: 1, ease: "easeOut" }} />
      </div>
    </div>
  );
}
