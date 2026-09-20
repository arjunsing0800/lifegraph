// LIFEGRAPH — ReceiptUniverse: every visible particle is a real receipt.
// Layout is data-driven: spiral angle = time (2013→2024), height = hour of day
// (IST), color = receipt type. Connections = validated strong links only.
// One Canvas, THREE.Points + LineSegments, no post-processing (mobile-safe).
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TYPE_COLORS } from "../engine/types";
import type { LifeMoment, LifeReceipt, ReceiptConnection } from "../engine/types";
import { ramp } from "../animation/sceneRanges";
import { samplePose } from "./cameraStates";

// Guarantees the drawing buffer matches the real viewport even if the initial
// R3F measurement raced layout (fonts, lazy mount, headless quirks).
function SizeGuard() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const fix = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const cur = gl.domElement.width / gl.getPixelRatio();
      if (Math.abs(cur - w) > 2 || gl.domElement.style.width !== `${w}px`) {
        gl.setSize(w, h); // also corrects canvas CSS size
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }
    };
    fix();
    const t1 = setTimeout(fix, 600);
    const t2 = setTimeout(fix, 2500);
    window.addEventListener("resize", fix);
    window.addEventListener("orientationchange", fix);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", fix); window.removeEventListener("orientationchange", fix); };
  }, [gl, camera]);
  return null;
}

interface Props {
  receipts: LifeReceipt[];
  connections: ReceiptConnection[];
  clusters: LifeMoment[];
  progressRef: React.MutableRefObject<number>;
  focusClusterId?: string | null;
  reducedMotion: boolean;
  dpr?: [number, number];
}

// deterministic PRNG for scatter offsets
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Scene({ receipts, connections, clusters, progressRef, focusClusterId, reducedMotion }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const clusterRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const pose = useRef({ pos: new THREE.Vector3(0, 30, 88), look: new THREE.Vector3(0, 0, 0), fov: 55 });

  // soft round sprite so points read as glowing dust, not squares
  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.7)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    receipts.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [receipts]);

  const layout = useMemo(() => {
    const n = receipts.length;
    const times = receipts.map((r) => Date.parse(r.timestamp));
    const tMin = Math.min(...times), tMax = Math.max(...times);
    const base = new Float32Array(n * 3);
    const scatter = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const rnd = mulberry(7);
    const col = new THREE.Color();
    const typeJitter: Record<string, number> = { music: 0, movie: 1.6, purchase: -1.6, event: 3.0, place: -3.0 };
    receipts.forEach((r, i) => {
      const t01 = (times[i] - tMin) / Math.max(1, tMax - tMin);
      const ang = t01 * Math.PI * 16;
      const rad = 13 + t01 * 13 + (typeJitter[r.type] ?? 0) + (rnd() - 0.5) * 2.4;
      const istH = new Date(times[i] + 5.5 * 3600000).getUTCHours();
      const y = ((istH - 12) / 12) * 9 + (rnd() - 0.5) * 1.6;
      base[i * 3] = Math.cos(ang) * rad;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = Math.sin(ang) * rad;
      const R = 46;
      scatter[i * 3] = (rnd() - 0.5) * R * 2;
      scatter[i * 3 + 1] = (rnd() - 0.5) * R;
      scatter[i * 3 + 2] = (rnd() - 0.5) * R * 2;
      col.set(TYPE_COLORS[r.type] ?? "#ffffff");
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    });
    return { base, scatter, colors, n };
  }, [receipts]);

  // live positions (lerped scatter -> structured)
  const live = useMemo(() => new Float32Array(layout.n * 3), [layout.n]);
  useEffect(() => { live.set(layout.scatter); }, [layout, live]);

  const lineGeom = useMemo(() => {
    const strong = connections.filter((c) => c.score >= 0.65).slice(0, 900);
    const pos = new Float32Array(strong.length * 6);
    strong.forEach((c, k) => {
      const a = indexOf.get(c.receiptA), b = indexOf.get(c.receiptB);
      if (a == null || b == null) return;
      pos[k * 6] = layout.base[a * 3]; pos[k * 6 + 1] = layout.base[a * 3 + 1]; pos[k * 6 + 2] = layout.base[a * 3 + 2];
      pos[k * 6 + 3] = layout.base[b * 3]; pos[k * 6 + 4] = layout.base[b * 3 + 1]; pos[k * 6 + 5] = layout.base[b * 3 + 2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [connections, indexOf, layout]);

  const clusterGeom = useMemo(() => {
    const pos = new Float32Array(clusters.length * 3);
    clusters.forEach((m, k) => {
      let x = 0, y = 0, z = 0, c = 0;
      for (const id of m.receiptIds) {
        const i = indexOf.get(id);
        if (i == null) continue;
        x += layout.base[i * 3]; y += layout.base[i * 3 + 1]; z += layout.base[i * 3 + 2]; c++;
      }
      pos[k * 3] = x / Math.max(1, c); pos[k * 3 + 1] = y / Math.max(1, c); pos[k * 3 + 2] = z / Math.max(1, c);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [clusters, indexOf, layout]);

  // focus dimming: recompute colors when selection changes
  useEffect(() => {
    const attr = pointsRef.current?.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const col = new THREE.Color();
    if (!focusClusterId) {
      for (let i = 0; i < layout.n; i++) {
        col.set(TYPE_COLORS[receipts[i].type] ?? "#fff");
        attr.setXYZ(i, col.r, col.g, col.b);
      }
    } else {
      const m = clusters.find((c) => c.id === focusClusterId);
      const set = new Set(m?.receiptIds ?? []);
      for (let i = 0; i < layout.n; i++) {
        col.set(TYPE_COLORS[receipts[i].type] ?? "#fff");
        if (!set.has(receipts[i].id)) col.multiplyScalar(0.12);
        attr.setXYZ(i, col.r, col.g, col.b);
      }
    }
    attr.needsUpdate = true;
  }, [focusClusterId, clusters, receipts, layout]);

  const focusCentroid = useMemo(() => {
    if (!focusClusterId) return null;
    const m = clusters.find((c) => c.id === focusClusterId);
    if (!m) return null;
    const v = new THREE.Vector3();
    let c = 0;
    for (const id of m.receiptIds) {
      const i = indexOf.get(id);
      if (i == null) continue;
      v.x += layout.base[i * 3]; v.y += layout.base[i * 3 + 1]; v.z += layout.base[i * 3 + 2]; c++;
    }
    return v.multiplyScalar(1 / Math.max(1, c));
  }, [focusClusterId, clusters, indexOf, layout]);

  useFrame((state, dt) => {
    const p = Math.min(1, Math.max(0, progressRef.current));
    const ease = reducedMotion ? (p > 0.5 ? 1 : 0) : p * p * (3 - 2 * p);
    // morph scatter -> structured
    const posAttr = pointsRef.current?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (posAttr) {
      const arr = posAttr.array as Float32Array;
      const k = reducedMotion ? 1 : Math.min(1, dt * 3);
      for (let i = 0; i < layout.n; i++) {
        const tx = layout.scatter[i * 3] + (layout.base[i * 3] - layout.scatter[i * 3]) * ease;
        const ty = layout.scatter[i * 3 + 1] + (layout.base[i * 3 + 1] - layout.scatter[i * 3 + 1]) * ease;
        const tz = layout.scatter[i * 3 + 2] + (layout.base[i * 3 + 2] - layout.scatter[i * 3 + 2]) * ease;
        arr[i * 3] += (tx - arr[i * 3]) * k;
        arr[i * 3 + 1] += (ty - arr[i * 3 + 1]) * k;
        arr[i * 3 + 2] += (tz - arr[i * 3 + 2]) * k;
      }
      posAttr.needsUpdate = true;
    }
    if (linesRef.current) {
      // threads emerge with the CONNECTIONS scene, fully present by MOMENT
      (linesRef.current.material as THREE.LineBasicMaterial).opacity = ramp(p, "CONNECTIONS", 0.14) * 0.55;
    }
    if (clusterRef.current) {
      // constellations ignite with the MOMENT scene
      const m = clusterRef.current.material as THREE.PointsMaterial;
      m.opacity = ramp(p, "MOMENT", 0.1) * (0.65 + 0.3 * Math.sin(state.clock.elapsedTime * 2));
    }
    if (groupRef.current && !reducedMotion && !focusClusterId) {
      groupRef.current.rotation.y += dt * 0.03 * (1 - p * 0.6);
    }
    // camera: named states interpolate; FOCUS overrides position/target
    const cam = state.camera as THREE.PerspectiveCamera;
    if (focusCentroid) {
      pose.current.pos.set(focusCentroid.x * 0.6, focusCentroid.y + 9, focusCentroid.z * 0.6 + 16);
      pose.current.look.copy(focusCentroid);
      pose.current.fov = 46;
    } else {
      samplePose(p, pose.current);
    }
    const ck = reducedMotion ? 1 : Math.min(1, dt * 2.2);
    cam.position.lerp(pose.current.pos, ck);
    // lookAt target damps too (prevents swivel jumps on state change)
    const look = (cam as unknown as { _lgLook?: THREE.Vector3 })._lgLook ??
      ((cam as unknown as { _lgLook: THREE.Vector3 })._lgLook = new THREE.Vector3());
    look.lerp(pose.current.look, ck);
    cam.lookAt(look);
    if (Math.abs(cam.fov - pose.current.fov) > 0.02) {
      cam.fov += (pose.current.fov - cam.fov) * ck;
      cam.updateProjectionMatrix();
    }
  });

  return (
    <group ref={groupRef}>
      <SizeGuard />
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[live, 3]} />
          <bufferAttribute attach="attributes-color" args={[Float32Array.from(layout.colors), 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.7} map={sprite} vertexColors sizeAttenuation transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} alphaTest={0.01} />
      </points>
      <lineSegments ref={linesRef} geometry={lineGeom} frustumCulled={false}>
        <lineBasicMaterial color="#a78bfa" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <points ref={clusterRef} geometry={clusterGeom} frustumCulled={false}>
        <pointsMaterial size={3.0} map={sprite} color="#c4b5fd" sizeAttenuation transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} alphaTest={0.01} />
      </points>
    </group>
  );
}

export default function ReceiptUniverse(props: Props) {
  return (
    <Canvas
      dpr={props.dpr ?? [1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 26, 70], fov: 55, near: 0.1, far: 400 }}
      aria-hidden
    >
      <Scene {...props} />
    </Canvas>
  );
}
