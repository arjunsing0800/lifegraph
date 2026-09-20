// LIFEGRAPH — near-invisible navigation: wordmark + act counter + hairline progress.
import { memo } from "react";

interface Props {
  act: number;
  actCount: number;
  progress: number; // 0..1, updated via rAF-throttled state in App
}

function Nav({ act, actCount, progress }: Props) {
  const label = `ACT ${String(act + 1).padStart(2, "0")} / ${String(actCount).padStart(2, "0")}`;
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <nav className="flex items-center justify-between px-5 py-3.5 md:px-8" aria-label="Primary">
        <span className="font-display text-[15px] font-bold tracking-tight">
          LIFE<span className="text-violet-400">GRAPH</span>
        </span>
        <span className="mono-meta text-dim" aria-live="polite">{label}</span>
      </nav>
      <div className="h-px bg-white/10" role="img" aria-label={`Narrative progress ${Math.round(progress * 100)} percent`}>
        <div className="h-full origin-left" style={{ transform: `scaleX(${progress})`, background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }} />
      </div>
    </header>
  );
}

export default memo(Nav);
