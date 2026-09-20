// LIFEGRAPH — GraphView: 2D force-graph explorer (canvas + d3-force).
// Nodes are real receipts (top-moment members), edges are validated connections.
// Click a node to inspect; click one of its links for the WHY CONNECTED panel.
import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { TYPE_COLORS } from "../engine/types";
import type { LifeReceipt, ReceiptConnection } from "../engine/types";

interface Node extends LifeReceipt {
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null;
}
interface Props {
  connections: ReceiptConnection[];
  byId: Map<string, LifeReceipt>;
  activeTypes: Set<string>;
  minScore: number;
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenConnection: (c: ReceiptConnection) => void;
}

export default function GraphView({ connections, byId, activeTypes, minScore, query, selectedId, onSelect, onOpenConnection }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const liveHover = useRef<string | null>(null);
  const liveSel = useRef<string | null>(null);
  useEffect(() => { liveSel.current = selectedId; }, [selectedId]);

  const { nodes, links } = useMemo(() => {
    // moment members first (they carry the story), cap ~450 nodes for perf
    const member = new Map<string, number>();
    for (const c of connections) {
      if (c.score < minScore) continue;
      member.set(c.receiptA, (member.get(c.receiptA) || 0) + 1);
      member.set(c.receiptB, (member.get(c.receiptB) || 0) + 1);
    }
    const ranked = [...member.entries()].sort((a, b) => b[1] - a[1]).slice(0, 450).map(([id]) => id);
    const nodes = ranked.map((id) => byId.get(id)!).filter((r) => r && activeTypes.has(r.type)) as Node[];
    const keep2 = new Set(nodes.map((n) => n.id));
    const links = connections.filter((c) => c.score >= minScore && keep2.has(c.receiptA) && keep2.has(c.receiptB) &&
      activeTypes.has(byId.get(c.receiptA)!.type) && activeTypes.has(byId.get(c.receiptB)!.type));
    return { nodes, links };
  }, [connections, byId, activeTypes, minScore]);

  const linkSet = useMemo(() => {
    const m = new Map<string, ReceiptConnection[]>();
    for (const l of links) {
      if (!m.has(l.receiptA)) m.set(l.receiptA, []);
      if (!m.has(l.receiptB)) m.set(l.receiptB, []);
      m.get(l.receiptA)!.push(l); m.get(l.receiptB)!.push(l);
    }
    return m;
  }, [links]);

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const W = wrap.clientWidth, H = Math.max(420, Math.min(640, wrap.clientWidth * 0.62));
    canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    nodesRef.current = nodes.map((n) => ({ ...n }));
    type FNode = Node & SimulationNodeDatum;
    const simNodes = nodesRef.current as FNode[];
    const idx = new Map(simNodes.map((n, i) => [n.id, i]));
    // d3 resolves link endpoints through the id accessor — pass string ids.
    // pristine index pairs are kept separately for drawing (d3 mutates links).
    const drawPairs: [number, number][] = [];
    const forcePairs: { source: string; target: string }[] = [];
    for (const l of links) {
      const a = idx.get(l.receiptA), b = idx.get(l.receiptB);
      if (a != null && b != null) { drawPairs.push([a, b]); forcePairs.push({ source: l.receiptA, target: l.receiptB }); }
    }
    const sim = forceSimulation<FNode>(simNodes)
      .force("link", forceLink<FNode, SimulationLinkDatum<FNode>>(forcePairs).id((d) => d.id).distance(46).strength(0.5))
      .force("charge", forceManyBody().strength(-90))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(9))
      .alphaDecay(0.06);
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const sel = liveSel.current, hov = liveHover.current;
      const focusSet = new Set<string>();
      if (sel) { focusSet.add(sel); for (const l of linkSet.get(sel) ?? []) { focusSet.add(l.receiptA); focusSet.add(l.receiptB); } }
      // edges
      for (const [ai, bi] of drawPairs) {
        const s = simNodes[ai], t = simNodes[bi];
        if (s.x == null || t.x == null) continue;
        const dim = sel && !(focusSet.has(s.id) && focusSet.has(t.id));
        ctx.strokeStyle = dim ? "rgba(244,241,234,0.05)" : "rgba(167,139,250,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y!); ctx.lineTo(t.x, t.y!); ctx.stroke();
      }
      // nodes
      for (const n of nodesRef.current) {
        if (n.x == null) continue;
        const isSel = n.id === sel, isHov = n.id === hov;
        const dim = sel && !focusSet.has(n.id);
        const q = query && (n.title.toLowerCase().includes(query.toLowerCase()));
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.fillStyle = TYPE_COLORS[n.type] ?? "#fff";
        ctx.beginPath(); ctx.arc(n.x, n.y!, isSel || isHov ? 7 : q ? 6 : 4, 0, Math.PI * 2); ctx.fill();
        if (isSel || isHov || q) {
          ctx.strokeStyle = "#f4f1ea"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.x, n.y!, isSel ? 10 : 8, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  // hover bridge: draw loop reads liveHover without re-running the simulation
  useEffect(() => { liveHover.current = hoverId; }, [hoverId]);

  const pick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best: Node | null = null, bd = 14;
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Interactive graph of connected life receipts"
        className="w-full cursor-pointer rounded-xl"
        style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.06), transparent 70%)" }}
        onMouseMove={(e) => { const n = pick(e); setHoverId(n?.id ?? null); }}
        onMouseLeave={() => setHoverId(null)}
        onClick={(e) => { const n = pick(e); onSelect(n ? (n.id === selectedId ? null : n.id) : null); }}
      />
      {(hoverId || selectedId) && (() => {
        const n = byId.get(hoverId ?? selectedId!);
        if (!n) return null;
        return (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[280px] card p-3 text-sm">
            <div className="mono-meta mb-1" style={{ color: TYPE_COLORS[n.type] }}>{n.type} · {n.source}</div>
            <div className="font-medium leading-snug">{n.title}</div>
            <div className="text-dim mt-1 text-xs">{new Date(n.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
            {selectedId === n.id && (
              <div className="pointer-events-auto mt-2 border-t hairline pt-2">
                <div className="mono-meta mb-1">Links ({(linkSet.get(n.id) ?? []).length})</div>
                <div className="max-h-36 space-y-1 overflow-auto">
                  {(linkSet.get(n.id) ?? []).slice(0, 8).map((l) => {
                    const other = byId.get(l.receiptA === n.id ? l.receiptB : l.receiptA);
                    return (
                      <button key={l.id} onClick={() => onOpenConnection(l)}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-white/10">
                        <span className="text-violet-300">{Math.round(l.score * 100)}%</span>
                        <span className="text-dim"> · {other?.title.slice(0, 42)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
