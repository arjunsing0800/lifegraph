// LIFEGRAPH — data loading hook. Generated JSON lives in public/data
// (fetched at runtime so the JS bundle stays lean).
import { useEffect, useMemo, useState } from "react";
import type {
  DatasetStats, LifeMoment, LifeReceipt, PatternInsight, ReceiptConnection, StoryCard,
} from "../engine/types";

export interface GraphData {
  receipts: LifeReceipt[];
  connections: ReceiptConnection[];
  clusters: LifeMoment[];
  patterns: PatternInsight[];
  stories: StoryCard[];
  stats: DatasetStats;
  byId: Map<string, LifeReceipt>;
  loaded: boolean;
  error: string | null;
}

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`failed to load ${name}.json`);
  return res.json() as Promise<T>;
}

// Module-level cache: App, ExploreDrawer and ConnectionPanel all consume the
// same dataset — fetch once, share everywhere. No duplicate network/memory.
let cache: Promise<Omit<GraphData, "byId" | "loaded" | "error">> | null = null;
function loadAll() {
  if (!cache) {
    cache = (async () => {
      const [receipts, connections, clusters, patterns, stories, stats] = await Promise.all([
        get<LifeReceipt[]>("unifiedReceipts"),
        get<ReceiptConnection[]>("connections"),
        get<LifeMoment[]>("clusters"),
        get<PatternInsight[]>("patterns"),
        get<StoryCard[]>("stories"),
        get<DatasetStats>("stats"),
      ]);
      return { receipts, connections, clusters, patterns, stories, stats };
    })();
    // allow retry after failure
    cache.catch(() => { cache = null; });
  }
  return cache;
}

export function useData(): GraphData {
  const [state, setState] = useState<Omit<GraphData, "byId"> & { byId?: Map<string, LifeReceipt> }>({
    receipts: [], connections: [], clusters: [], patterns: [], stories: [],
    stats: null as unknown as DatasetStats, loaded: false, error: null,
  });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const all = await loadAll();
        if (live) setState({ ...all, loaded: true, error: null });
      } catch (e) {
        if (live) setState((s) => ({ ...s, error: (e as Error).message }));
      }
    })();
    return () => { live = false; };
  }, []);

  const byId = useMemo(() => new Map(state.receipts.map((r) => [r.id, r])), [state.receipts]);
  return { ...state, byId } as GraphData;
}
