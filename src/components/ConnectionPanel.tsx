// LIFEGRAPH — ConnectionPanel: the signature WHY CONNECTED experience.
// Every claim is evidence from the connection object. No invented narrative.
import { motion } from "framer-motion";
import { ArrowDown, Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { TYPE_COLORS } from "../engine/types";
import type { LifeMoment, ReceiptConnection } from "../engine/types";
import { evidenceLines, fmtDateTime, strengthLabel } from "../engine/format";
import { useData } from "../hooks/useData";

interface Props {
  connection: ReceiptConnection;
  moment?: LifeMoment | null;
  onClose: () => void;
  onExploreMoment?: (m: LifeMoment) => void;
}

export default function ConnectionPanel({ connection, moment, onClose, onExploreMoment }: Props) {
  const { byId } = useData();
  const panelRef = useRef<HTMLElement>(null);
  // entry focus + ESC; App restores focus to the trigger on close
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const A = byId.get(connection.receiptA);
  const B = byId.get(connection.receiptB);
  if (!A || !B) return null;
  const pct = Math.round(connection.score * 100);

  const card = (r: typeof A) => (
    <div className="rounded-lg border hairline bg-white/[0.03] p-3">
      <div className="mono-meta mb-1" style={{ color: TYPE_COLORS[r.type] }}>{r.type} · {r.source}</div>
      <div className="text-sm font-medium leading-snug">{r.title}</div>
      <div className="text-dim mt-1 text-xs">{fmtDateTime(r.timestamp)}</div>
      {r.location?.city && <div className="text-dim text-xs">{r.location.city}{r.location.state ? `, ${r.location.state}` : ""}</div>}
    </div>
  );

  return (
    <motion.aside
      ref={panelRef}
      tabIndex={-1}
      initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="card fixed right-4 top-20 z-40 max-h-[calc(100vh-7rem)] w-[min(380px,calc(100vw-2rem))] overflow-auto p-5 shadow-2xl"
      role="dialog" aria-label="Why these receipts are connected"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="mono-meta text-violet-300">Connection found</span>
        <button onClick={onClose} aria-label="Close connection panel" className="rounded-full p-1 hover:bg-white/10"><X size={16} /></button>
      </div>
      <div className="font-display mb-4 text-4xl font-bold glow-violet">{pct}<span className="text-lg text-dim">%</span>
        <span className="text-dim ml-2 align-middle text-xs font-normal tracking-widest uppercase">{strengthLabel(connection.score)}</span>
      </div>

      {card(A)}
      <div className="my-1 flex justify-center text-violet-300"><ArrowDown size={16} /></div>
      {card(B)}

      <div className="mono-meta mb-2 mt-4 text-dim">Why connected?</div>
      <ul className="space-y-2">
        {evidenceLines(connection).map((line, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <div className="mono-meta mb-1 text-dim">Connection strength</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`Connection strength ${pct} percent`}>
          <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }}
            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
        </div>
      </div>

      {moment && onExploreMoment && (
        <button onClick={() => onExploreMoment(moment)} className="btn-primary mt-4 w-full px-4 py-2.5 text-sm">
          Explore moment — {moment.receiptCount} receipts
        </button>
      )}
      <p className="text-dim mt-3 text-[11px] leading-relaxed">
        Scores combine temporal proximity (40%), place context (25%), shared entities (20%) and activity relationship (15%).
        Links across different sources are capped unless they share an entity or place.
      </p>
    </motion.aside>
  );
}
