// LIFEGRAPH — cinematic camera states. The single authoritative camera
// choreography: scroll progress selects a state, poses interpolate smoothly.
// Consumed by ReceiptUniverse; also drives the ACT labels in Nav if needed.
import * as THREE from "three";

export type CamStateName = "VOID" | "DRIFT" | "REVEAL" | "THREADS" | "CONSTELLATION" | "FOCUS";

export interface CamPose { pos: [number, number, number]; look: [number, number, number]; fov: number }

export const CAM_KEYS: { at: number; name: CamStateName; pose: CamPose }[] = [
  { at: 0.0, name: "VOID", pose: { pos: [0, 30, 88], look: [0, 0, 0], fov: 55 } },
  { at: 0.18, name: "DRIFT", pose: { pos: [0, 28, 78], look: [0, 0, 0], fov: 55 } },
  { at: 0.38, name: "REVEAL", pose: { pos: [6, 20, 58], look: [0, -1, 0], fov: 52 } },
  { at: 0.58, name: "THREADS", pose: { pos: [-6, 14, 44], look: [0, -1.5, 0], fov: 50 } },
  { at: 0.8, name: "CONSTELLATION", pose: { pos: [4, 10, 34], look: [0, -2, 0], fov: 48 } },
  { at: 1.0, name: "CONSTELLATION", pose: { pos: [0, 8, 30], look: [0, -2, 0], fov: 46 } },
];

export function camStateFor(p: number): CamStateName {
  let name = CAM_KEYS[0].name;
  for (const k of CAM_KEYS) if (p >= k.at) name = k.name;
  return name;
}

export interface SampledPose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

export function samplePose(p: number, out: SampledPose): void {
  let a = CAM_KEYS[0], b = CAM_KEYS[CAM_KEYS.length - 1];
  for (let i = 0; i < CAM_KEYS.length - 1; i++) {
    if (p >= CAM_KEYS[i].at && p <= CAM_KEYS[i + 1].at) { a = CAM_KEYS[i]; b = CAM_KEYS[i + 1]; break; }
  }
  const span = Math.max(1e-6, b.at - a.at);
  let t = Math.min(1, Math.max(0, (p - a.at) / span));
  t = t * t * (3 - 2 * t);
  out.pos.set(
    a.pose.pos[0] + (b.pose.pos[0] - a.pose.pos[0]) * t + Math.sin(p * 2.2) * 3 * (1 - p * 0.5),
    a.pose.pos[1] + (b.pose.pos[1] - a.pose.pos[1]) * t,
    a.pose.pos[2] + (b.pose.pos[2] - a.pose.pos[2]) * t,
  );
  out.look.set(
    a.pose.look[0] + (b.pose.look[0] - a.pose.look[0]) * t,
    a.pose.look[1] + (b.pose.look[1] - a.pose.look[1]) * t,
    a.pose.look[2] + (b.pose.look[2] - a.pose.look[2]) * t,
  );
  out.fov = a.pose.fov + (b.pose.fov - a.pose.fov) * t;
}
