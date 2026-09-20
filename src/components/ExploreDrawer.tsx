// LIFEGRAPH — ExploreDrawer: the in-page archive.
// Search (fuzzy) + type/source filters + results. Selecting a receipt shows its
// detail and its validated links; opening a link raises the WHY CONNECTED panel.
// Closes back to the exact same scroll position (fixed overlay, scroll locked).
import { AnimatePresence, motion } from "framer-motion";
import Fuse from "fuse.js";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { TYPE_COLORS } from "../engine/types";
import type { ReceiptConnection } from "../engine/types";
import { fmtDateTime } from "../engine/format";
import { useData } from "../hooks/useData";

const GraphView = lazy(() => import("./GraphView"));

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenConnection: (c: ReceiptConnection) => void;
}

const TYPES = ["music", "purchase", "movie", "event"] as const;
const SOURCES = ["spotify", "household", "augmented"] as const;

export default function ExploreDrawer({ open, onClose, onOpenConnection }: Props) {
  const { receipts, connections, byId } = useData();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Set<string>>(() => new Set(TYPES));
  const [sources, setSources] = useState<Set<string>>(() => new Set(SOURCES));
  const [selId, setSelId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isMobileSheet, setIsMobileSheet] = useState(false);

  // focus search on open; ESC closes; bottom-sheet composition on small screens
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobileSheet(mq.matches);
    const t = setTimeout(() => searchRef.current?.focus(), 350);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const fuse = useMemo(() => new Fuse(receipts, {
    keys: ["title", "entities", "location.city", "location.state", "source", "type"],
    threshold: 0.38, ignoreLocation: true, minMatchCharLength: 2,
  }), [receipts]);

  const results = useMemo(() => {
    const q = query.trim();
    const base = q ? fuse.search(q).map((r) => r.item) : receipts;
    return base.filter((r) => types.has(r.type) && sources.has(r.source)).slice(0, 60);
  }, [fuse, query, receipts, types, sources]);

  const sel = selId ? byId.get(selId) : undefined;
  const selLinks = useMemo(() => {
    if (!selId) return [];
    return connections
      .filter((c) => c.receiptA === selId || c.receiptB === selId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [connections, selId]);

  const toggle = (set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) { if (n.size > 1) n.delete(v); }
    else n.add(v);
    return n;
  };
  const filtersActive = query.trim() !== "" || types.size !== TYPES.length || sources.size !== SOURCES.length;
  const clearFilters = () => { setQuery(""); setTypes(new Set(TYPES)); setSources(new Set(SOURCES)); setSelId(null); };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={isMobileSheet ? { y: "100%" } : { x: "100%" }}
            animate={isMobileSheet ? { y: 0 } : { x: 0 }}
            exit={isMobileSheet ? { y: "100%" } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(460px,100vw)] flex-col border-l hairline bg-[#0a0a10]/95 backdrop-blur-md max-md:inset-x-0 max-md:top-auto max-md:h-[88vh] max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t"
            role="dialog" aria-modal="true" aria-label="Explore the receipts archive">
            <div className="border-b hairline p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="mono-meta text-violet-300">The archive</div>
                  <h2 className="font-display text-2xl font-bold">Explore the receipts</h2>
                </div>
                <button onClick={onClose} aria-label="Close archive" className="rounded-full p-2 hover:bg-white/10"><X size={18} /></button>
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-full border hairline px-4 py-2.5">
                <Search size={15} className="text-dim shrink-0" />
                <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelId(null); }}
                  placeholder="Titles, artists, merchants, cities…" aria-label="Search receipts"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-stone-600" />
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Type filters">
                {TYPES.map((t) => (
                  <button key={t} aria-pressed={types.has(t)} onClick={() => setTypes((p) => toggle(p, t))}
                    className="chip" style={types.has(t) ? { borderColor: TYPE_COLORS[t], color: TYPE_COLORS[t] } : {}}>{t}</button>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Source filters">
                {SOURCES.map((s) => (
                  <button key={s} aria-pressed={sources.has(s)} onClick={() => setSources((p) => toggle(p, s))}
                    className={`chip ${sources.has(s) ? "!text-white" : ""}`}>{s}</button>
                ))}
                {filtersActive && (
                  <button onClick={clearFilters} className="chip !border-cyan-400 !text-cyan-300">Clear filters ✕</button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {!sel ? (
                <>
                  <div className="mono-meta text-dim px-1 pb-2">
                    {query ? `${results.length} matches` : `${receipts.length.toLocaleString()} receipts`} — showing {results.length}
                  </div>
                  <ul className="space-y-1">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => setSelId(r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[r.type] }} />
                          <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                          <ArrowUpRight size={14} className="text-dim shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setShowMap((v) => !v)} className="btn-ghost mt-4 w-full py-2.5 text-xs" aria-expanded={showMap}>
                    {showMap ? "Hide link map" : "Show link map (supporting view)"}
                  </button>
                  {showMap && (
                    <div className="mt-2 overflow-hidden rounded-xl border hairline">
                      <Suspense fallback={<div className="p-6 text-center text-dim text-xs">Summoning the graph…</div>}>
                        <GraphView connections={connections} byId={byId}
                          activeTypes={types} minScore={0.65} query=""
                          selectedId={selId} onSelect={setSelId} onOpenConnection={onOpenConnection} />
                      </Suspense>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <button onClick={() => setSelId(null)} className="text-dim mb-3 text-xs hover:text-white">← Back to results</button>
                  <div className="mono-meta" style={{ color: TYPE_COLORS[sel!.type] }}>{sel!.type} · {sel!.source}</div>
                  <h3 className="font-display mt-1 text-xl font-semibold leading-snug">{sel!.title}</h3>
                  <div className="text-dim mt-1 text-xs">{fmtDateTime(sel!.timestamp)}</div>
                  {sel!.amount != null && <div className="mt-1 text-sm">{sel!.currency || "₹"} {Number(sel!.amount).toLocaleString("en-IN")}</div>}
                  {sel!.location?.city && <div className="text-dim mt-1 text-xs">📍 {sel!.location.city}{sel!.location.state ? `, ${sel!.location.state}` : ""} (city-level context only)</div>}
                  {sel!.entities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sel!.entities.slice(0, 8).map((e) => <span key={e} className="chip">{e.replace(/^(artist|album):/, "")}</span>)}
                    </div>
                  )}
                  <div className="mono-meta text-dim mb-2 mt-5">Validated links ({selLinks.length})</div>
                  {selLinks.length === 0 && <p className="text-dim text-xs">No link above the evidence threshold. It stands alone — for now.</p>}
                  <ul className="space-y-1.5">
                    {selLinks.map((l) => {
                      const other = byId.get(l.receiptA === sel!.id ? l.receiptB : l.receiptA);
                      return (
                        <li key={l.id}>
                          <button onClick={() => onOpenConnection(l)} className="block w-full rounded-lg border hairline p-3 text-left hover:border-violet-400/50">
                            <span className="text-sm font-semibold text-violet-300">{Math.round(l.score * 100)}%</span>
                            <span className="text-dim"> · {l.evidence.temporal.minutesApart === 0 ? "same minute" : `${l.evidence.temporal.minutesApart} min apart`}</span>
                            <span className="mt-0.5 block truncate text-xs">{other?.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
