// Generic reusable scene parts (either room may use them): an indicator lamp,
// a dial gauge with a canvas-drawn face and animated needle, and a pivoting
// lever. All animate in useFrame from caller-supplied getters (no React
// state per frame) and share geometries.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  type Material,
} from "three";
import { useCanvasTexture } from "./canvasTexture.ts";
import { PALETTE } from "./palette.ts";

type V3 = [number, number, number];

let shared: { lens: SphereGeometry; bezel: TorusGeometry; ring: TorusGeometry; disc: CylinderGeometry; box: BoxGeometry; brass: MeshStandardMaterial; enamel: MeshStandardMaterial } | null = null;
function S() {
  return (shared ??= {
    lens: new SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    bezel: new TorusGeometry(0.5, 0.09, 8, 24),
    ring: new TorusGeometry(0.5, 0.025, 8, 48),
    disc: new CylinderGeometry(0.5, 0.5, 1, 32),
    box: new BoxGeometry(1, 1, 1),
    brass: new MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.8 }),
    enamel: new MeshStandardMaterial({ color: PALETTE.enamel, roughness: 0.5, metalness: 0.2 }),
  });
}

// ------------------------------------------------------------------ lamp

/** A domed indicator lamp facing +Z. `level()` (0..1) is read every frame. */
export function Lamp({
  position,
  rotation,
  color,
  size = 0.08,
  level,
}: {
  position: V3;
  rotation?: V3;
  color: string;
  size?: number;
  level: () => number;
}) {
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: PALETTE.lampOff, emissive: color, emissiveIntensity: 0, roughness: 0.3 }),
    [color],
  );
  const offColor = useMemo(() => mat.color.clone(), [mat]);
  const onColor = useMemo(() => mat.emissive.clone(), [mat]);
  useFrame(() => {
    const l = Math.max(0, Math.min(1, level()));
    mat.emissiveIntensity = l * 2.4;
    mat.color.copy(offColor).lerp(onColor, l * 0.6);
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={S().lens} material={mat} rotation={[Math.PI / 2, 0, 0]} scale={size} />
      <mesh geometry={S().bezel} material={S().brass} scale={size * 1.05} />
    </group>
  );
}

// ------------------------------------------------------------------ dial

export type DialTick = { v: number; label?: string };
export type DialZone = { from: number; to: number; color: string };
export type DialMark = { v: number; color: string; text?: string };
export type DialSpec = {
  min: number;
  max: number;
  /** labelled major ticks */
  ticks: DialTick[];
  /** unlabelled minor tick step (optional) */
  minor?: number;
  title?: string;
  subtitle?: string;
  zones?: DialZone[];
  marks?: DialMark[];
  /** total sweep in radians (default 270°) */
  sweep?: number;
  /** maps a value to 0..1 along the sweep (default linear) */
  map?: (v: number) => number;
};

const frac = (spec: DialSpec, v: number): number => {
  const f = spec.map ? spec.map(v) : (v - spec.min) / (spec.max - spec.min);
  return Math.max(-0.02, Math.min(1.02, f));
};
/** Angle clockwise from 12 o'clock for value v. */
export const dialAngle = (spec: DialSpec, v: number): number => {
  const sweep = spec.sweep ?? Math.PI * 1.5;
  return -sweep / 2 + frac(spec, v) * sweep;
};

export function drawDialFace(ctx: CanvasRenderingContext2D, W: number, spec: DialSpec): void {
  const c = W / 2;
  const R = W * 0.47;
  const font = `"Arial Black", Impact, "DejaVu Sans", Arial, sans-serif`;
  ctx.fillStyle = PALETTE.dialFace;
  ctx.beginPath();
  ctx.arc(c, c, R + W * 0.03, 0, Math.PI * 2);
  ctx.fill();
  const pt = (a: number, r: number): [number, number] => [c + Math.sin(a) * r, c - Math.cos(a) * r];
  const arc = (from: number, to: number, r: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, r, dialAngle(spec, from) - Math.PI / 2, dialAngle(spec, to) - Math.PI / 2);
    ctx.stroke();
  };
  for (const z of spec.zones ?? []) arc(z.from, z.to, R * 0.86, R * 0.13, z.color);
  // scale line
  arc(spec.min, spec.max, R * 0.93, W * 0.008, PALETTE.dialInk);
  ctx.strokeStyle = PALETTE.dialInk;
  ctx.lineCap = "butt";
  if (spec.minor) {
    ctx.lineWidth = W * 0.007;
    for (let v = spec.min; v <= spec.max + 1e-6; v += spec.minor) {
      const a = dialAngle(spec, v);
      const [x0, y0] = pt(a, R * 0.93);
      const [x1, y1] = pt(a, R * 0.85);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  const nTicks = spec.ticks.length;
  const numSize = W * (nTicks > 9 ? 0.085 : 0.11);
  ctx.font = `900 ${numSize}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of spec.ticks) {
    const a = dialAngle(spec, t.v);
    ctx.lineWidth = W * 0.016;
    const [x0, y0] = pt(a, R * 0.95);
    const [x1, y1] = pt(a, R * 0.78);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (t.label !== undefined) {
      const [tx, ty] = pt(a, R * 0.62);
      ctx.fillStyle = PALETTE.dialInk;
      ctx.fillText(t.label, tx, ty);
    }
  }
  for (const m of spec.marks ?? []) {
    const a = dialAngle(spec, m.v);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = W * 0.03;
    const [x0, y0] = pt(a, R * 1.0);
    const [x1, y1] = pt(a, R * 0.7);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (m.text) {
      // white-backed tag so the mark reads by text, not only by colour
      const [tx, ty] = pt(a, R * 0.42);
      ctx.font = `900 ${W * 0.075}px ${font}`;
      const tw = ctx.measureText(m.text).width + W * 0.03;
      ctx.fillStyle = m.color;
      ctx.fillRect(tx - tw / 2, ty - W * 0.05, tw, W * 0.1);
      ctx.fillStyle = "#fff";
      ctx.fillText(m.text, tx, ty + W * 0.004);
    }
  }
  ctx.fillStyle = PALETTE.dialInk;
  if (spec.title) {
    ctx.font = `900 ${W * 0.07}px ${font}`;
    ctx.fillText(spec.title, c, c + R * 0.25, R * 0.66);
  }
  if (spec.subtitle) {
    ctx.font = `700 ${W * 0.05}px ${font}`;
    ctx.fillText(spec.subtitle, c, c + R * 0.78, R * 0.7);
  }
}

/** A round gauge facing +Z. `value()` is read every frame; the needle eases. */
export function Dial({
  position,
  rotation,
  diameter,
  spec,
  specKey,
  value,
  needleColor = "#b8322a",
  px = 512,
  faceGlow = 0.35,
}: {
  position: V3;
  rotation?: V3;
  diameter: number;
  spec: DialSpec;
  /** changes whenever `spec` changes (spec objects are rebuilt each render) */
  specKey: string;
  value: () => number;
  needleColor?: string;
  px?: number;
  /** emissive strength of the face (lower it where lamps wash the dial out) */
  faceGlow?: number;
}) {
  const tex = useCanvasTexture(px, px, (ctx, W) => drawDialFace(ctx, W, spec), [specKey]);
  const needle = useRef<Group>(null);
  const cur = useRef<number | null>(null);
  const needleMat = useMemo(() => new MeshStandardMaterial({ color: needleColor, roughness: 0.5 }), [needleColor]);
  useFrame((_, dt) => {
    const target = dialAngle(spec, value());
    cur.current = cur.current === null ? target : cur.current + (target - cur.current) * Math.min(1, dt * 7);
    if (needle.current) needle.current.rotation.z = -cur.current;
  });
  const r = diameter / 2;
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={S().disc} material={S().enamel} rotation={[Math.PI / 2, 0, 0]} scale={[r * 2.12, 0.04, r * 2.12]} position={[0, 0, -0.02]} />
      <mesh geometry={S().ring} material={S().brass} scale={[r * 2.06, r * 2.06, r * 2]} position={[0, 0, 0.005]} />
      <mesh position={[0, 0, 0.003]}>
        <circleGeometry args={[r, 40]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={faceGlow} roughness={0.7} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.02]}>
        <mesh geometry={S().box} material={needleMat} position={[0, r * 0.38, 0]} scale={[r * 0.06, r * 0.9, 0.01]} />
        <mesh geometry={S().box} material={needleMat} position={[0, -r * 0.1, 0]} scale={[r * 0.1, r * 0.2, 0.01]} />
      </group>
      <mesh geometry={S().disc} material={S().brass} rotation={[Math.PI / 2, 0, 0]} scale={[r * 0.16, 0.03, r * 0.16]} position={[0, 0, 0.03]} />
    </group>
  );
}

// ------------------------------------------------------------------ lever

/** A handle pivoting about local X at the origin; rest direction +Y. The
 * angle eases to `angle` (radians, positive tilts the handle toward +Z). */
export function Lever({
  position,
  rotation,
  angle,
  length = 0.4,
  thickness = 0.04,
  knob = PALETTE.valveRed,
  knobMaterial,
  armMaterial,
  speed = 10,
}: {
  position: V3;
  rotation?: V3;
  angle: number;
  length?: number;
  thickness?: number;
  knob?: string;
  knobMaterial?: Material;
  armMaterial?: Material;
  speed?: number;
}) {
  const ref = useRef<Group>(null);
  const knobMat = useMemo(() => knobMaterial ?? new MeshStandardMaterial({ color: knob, roughness: 0.45 }), [knob, knobMaterial]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.x += (angle - g.rotation.x) * Math.min(1, dt * speed);
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={S().disc} material={S().brass} rotation={[0, 0, Math.PI / 2]} scale={[thickness * 2.4, thickness * 3, thickness * 2.4]} />
      <group ref={ref} rotation={[angle, 0, 0]}>
        <mesh geometry={S().box} material={armMaterial ?? S().enamel} position={[0, length / 2, 0]} scale={[thickness, length, thickness]} />
        <mesh geometry={S().disc} material={knobMat} position={[0, length, 0]} rotation={[0, 0, Math.PI / 2]} scale={[thickness * 2.2, thickness * 5, thickness * 2.2]} />
      </group>
    </group>
  );
}
