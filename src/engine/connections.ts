// LIFEGRAPH — client-side connection scoring.
// Mirrors scripts/build-data.mjs exactly (same weights, same guards) so any
// receipt pair can be explained live in the browser. Deterministic, no AI.
import { SCORE_WEIGHTS, STRONG_THRESHOLD } from "./types";
import type { ConnectionEvidence, LifeReceipt } from "./types";

const CAT_REL = new Map<string, number>([
  ["music|purchase", 0.8], ["music|movie", 0.7], ["music|event", 0.8], ["music|place", 0.6],
  ["purchase|place", 0.8], ["purchase|event", 0.6], ["movie|event", 0.8], ["purchase|movie", 0.7],
  ["music|music", 0.5], ["purchase|purchase", 0.4], ["movie|movie", 0.6], ["event|event", 0.6],
  ["place|place", 0.5],
]);

function catRel(a: string, b: string): number {
  if (a === b) return CAT_REL.get(`${a}|${a}`) ?? 0.3;
  return CAT_REL.get(`${a}|${b}`) ?? CAT_REL.get(`${b}|${a}`) ?? 0.2;
}

function jaccard(A: Set<string>, B: Set<string>): number {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface ScoredPair {
  score: number;
  strong: boolean;
  evidence: ConnectionEvidence;
}

/** Score any two receipts with the batch engine's formula. */
export function scorePair(A: LifeReceipt, B: LifeReceipt): ScoredPair {
  const mins = Math.abs(Date.parse(A.timestamp) - Date.parse(B.timestamp)) / 60000;
  const timeScore = Math.max(0, 1 - mins / 120);

  const cityA = A.location?.city?.toLowerCase();
  const cityB = B.location?.city?.toLowerCase();
  const sameCity = !!cityA && !!cityB && cityA === cityB;
  const routes = (r: LifeReceipt) => r.entities.filter((e) => /^place-\d+$/.test(e));
  const rA = routes(A), rB = routes(B);
  const sameRoute = rA.length > 0 && rB.length > 0 && rA.some((x) => rB.includes(x));
  let locScore: number;
  let locEv: ConnectionEvidence["location"];
  if (sameCity) { locScore = 1; locEv = { sameCity: true, cityA: A.location!.city, cityB: B.location!.city, score: 1 }; }
  else if (sameRoute) { locScore = 1; locEv = { sameRouteContext: true, score: 1 }; }
  else if (!cityA || !cityB) { locScore = 0.35; locEv = { score: 0.35 }; }
  else { locScore = 0; locEv = { sameCity: false, cityA: A.location!.city, cityB: B.location!.city, score: 0 }; }

  const setA = new Set(A.entities), setB = new Set(B.entities);
  const shared = [...setA].filter((e) => setB.has(e));
  const raw = shared.length ? jaccard(setA, setB) : 0;
  const shareArtist = shared.some((e) => e.startsWith("artist:"));
  const entScore = shareArtist ? Math.max(raw, 0.55) : raw;

  const cr = catRel(A.type, B.type);
  let score = timeScore * SCORE_WEIGHTS.temporal + locScore * SCORE_WEIGHTS.location +
    entScore * SCORE_WEIGHTS.entity + cr * SCORE_WEIGHTS.category;
  if (A.source !== B.source && !shared.length && !sameCity && !sameRoute && score > 0.6) score = 0.6;
  score = Math.round(score * 100) / 100;

  return {
    score,
    strong: score >= STRONG_THRESHOLD,
    evidence: {
      temporal: { minutesApart: Math.round(mins), score: Math.round(timeScore * 100) / 100 },
      location: locEv,
      entity: { sharedEntities: shared.slice(0, 5), score: Math.round(entScore * 100) / 100 },
      category: { relationship: A.type === B.type ? `${A.type} → ${B.type} (same activity)` : `${A.type} → ${B.type}`, score: cr },
    },
  };
}
