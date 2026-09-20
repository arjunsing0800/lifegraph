// LIFEGRAPH — unified data model
// Single source of truth for receipt / connection / cluster / pattern / story shapes.
// Batch precomputation lives in scripts/build-data.mjs (Node); these types are the
// contract between generated JSON and the React UI. No field here is fabricated:
// missing source data stays undefined.

export type ReceiptType =
  | "music"
  | "movie"
  | "place"
  | "purchase"
  | "photo"
  | "message"
  | "search"
  | "event"
  | "note"
  | "activity";

export type ReceiptSource = "spotify" | "household" | "augmented";

export interface LifeReceipt {
  id: string;
  type: ReceiptType;
  timestamp: string; // ISO-8601 UTC
  title: string;
  description?: string;
  amount?: number;
  currency?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  entities: string[];
  tags: string[];
  source: ReceiptSource;
  sourceId: string;
  metadata?: Record<string, unknown>;
}

export interface TemporalEvidence {
  minutesApart: number;
  score: number;
}

export interface LocationEvidence {
  sameCity?: boolean;
  cityA?: string;
  cityB?: string;
  sameRouteContext?: boolean;
  score: number;
}

export interface EntityEvidence {
  sharedEntities: string[];
  score: number;
}

export interface CategoryEvidence {
  relationship: string;
  score: number;
}

export interface ConnectionEvidence {
  temporal: TemporalEvidence;
  location: LocationEvidence;
  entity: EntityEvidence;
  category: CategoryEvidence;
}

export interface ReceiptConnection {
  id: string;
  receiptA: string;
  receiptB: string;
  score: number;
  evidence: ConnectionEvidence;
}

export interface LifeMoment {
  id: string;
  receiptIds: string[];
  connectionIds: string[];
  centroidTime: string;
  centroidLocation?: { city?: string; state?: string };
  topEntities: string[];
  dominantTypes: ReceiptType[];
  durationMinutes: number;
  receiptCount: number;
  categoryCount: number;
  title: string;
  summary: string;
}

export type PatternKind = "temporal" | "recurrence" | "shift" | "cross-type";

export interface PatternInsight {
  id: string;
  type: PatternKind;
  title: string;
  description: string;
  strength: number; // 0..1, data support — never a subjective rating
  evidenceReceiptIds: string[];
  supportingStats: Record<string, number | string>;
}

export type StoryKind = "ritual" | "shift" | "recurrence" | "journey";

export interface StoryCard {
  id: string;
  title: string;
  description: string;
  receiptIds: string[];
  clusterIds: string[];
  patternType: StoryKind;
  strength: number;
  evidence: { label: string; value: string }[];
}

export interface DatasetStats {
  totalReceipts: number;
  bySource: Record<ReceiptSource, number>;
  byType: Record<string, number>;
  timeMin: string;
  timeMax: string;
  yearsCovered: number;
  fullCorpus: {
    spotifyPlays: number;
    spotifyPlaysOver30s: number;
    householdRows: number;
    augmentedRows: number;
  };
  topArtists: { name: string; plays: number }[];
  topHouseholdCategories: { name: string; count: number }[];
  topAugmentedCategories: { name: string; count: number }[];
  connectionCount: number;
  strongConnectionCount: number;
  clusterCount: number;
  patternCount: number;
  storyCount: number;
  locationNote: string;
  samplingNote: string;
}

// Scoring weights — MUST match scripts/build-data.mjs
export const SCORE_WEIGHTS = {
  temporal: 0.4,
  location: 0.25,
  entity: 0.2,
  category: 0.15,
} as const;

export const STRONG_THRESHOLD = 0.65;
export const POSSIBLE_THRESHOLD = 0.55;
export const TIME_WINDOW_MINUTES = 120;

export const TYPE_COLORS: Record<ReceiptType, string> = {
  music: "#8b5cf6", // electric violet
  movie: "#f59e0b", // warm accent
  place: "#22d3ee", // cyan
  purchase: "#3b82f6", // electric blue
  photo: "#ec4899",
  message: "#34d399",
  search: "#a3e635",
  event: "#fb7185",
  note: "#e7e5e4",
  activity: "#94a3b8",
};
