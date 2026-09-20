// LIFEGRAPH — centralized scene ranges. The single map from global scroll
// progress (0..1) to narrative scenes. Consumed by the universe (connection /
// cluster reveal ramps) so thresholds live in one place instead of magic
// numbers scattered through the render loop.
export type SceneName =
  | "OPENING" | "RECEIPTS" | "ORGANIZE" | "CONNECTIONS" | "MOMENT" | "WHY"
  | "STORY" | "PATTERN" | "CHANGE" | "DISCOVERIES" | "EXPLORE" | "END";

export interface SceneRange { name: SceneName; act: number; from: number; to: number }

// Twelve acts share the page evenly; ranges approximate act midpoints in
// global progress. Updated if act heights change materially.
export const SCENE_RANGES: SceneRange[] = [
  { name: "OPENING", act: 0, from: 0.0, to: 0.09 },
  { name: "RECEIPTS", act: 1, from: 0.09, to: 0.18 },
  { name: "ORGANIZE", act: 2, from: 0.18, to: 0.3 },
  { name: "CONNECTIONS", act: 3, from: 0.3, to: 0.4 },
  { name: "MOMENT", act: 4, from: 0.4, to: 0.5 },
  { name: "WHY", act: 5, from: 0.5, to: 0.58 },
  { name: "STORY", act: 6, from: 0.58, to: 0.7 },
  { name: "PATTERN", act: 7, from: 0.7, to: 0.78 },
  { name: "CHANGE", act: 8, from: 0.78, to: 0.85 },
  { name: "DISCOVERIES", act: 9, from: 0.85, to: 0.93 },
  { name: "EXPLORE", act: 10, from: 0.93, to: 0.97 },
  { name: "END", act: 11, from: 0.97, to: 1.01 },
];

export function sceneAtProgress(p: number): SceneRange {
  for (const s of SCENE_RANGES) if (p >= s.from && p < s.to) return s;
  return SCENE_RANGES[SCENE_RANGES.length - 1];
}

/** Normalized 0..1 progress of global p within a named scene. */
export function localProgress(p: number, name: SceneName): number {
  const s = SCENE_RANGES.find((r) => r.name === name)!;
  return Math.min(1, Math.max(0, (p - s.from) / (s.to - s.from)));
}

/** 0..1 ramp that starts when `name` begins and completes `span` later (in global progress). */
export function ramp(p: number, name: SceneName, span = 0.12): number {
  const s = SCENE_RANGES.find((r) => r.name === name)!;
  return Math.min(1, Math.max(0, (p - s.from) / span));
}
