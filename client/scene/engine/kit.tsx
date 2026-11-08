// Engine Room building kit: shared materials and unit geometries (reused by
// every station so the room costs a handful of GPU objects), box/cylinder
// shorthands, canvas label plates and narrow store selectors.

import { useMemo, type ReactNode } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Material,
} from "three";
import { useShallow } from "zustand/react/shallow";
import { SHIP_PHASES, type EngineerView, type Phase } from "../../../shared/protocol.ts";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { dressStd } from "../look/surfaces.ts";

type V3 = [number, number, number];

// ------------------------------------------------------------ state helpers

const ORDER: readonly Phase[] = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED"];

/** How far the voyage got: index in ORDER (LOST counts as the phase reached). */
export function stageOf(v: EngineerView | null): number {
  if (!v) return 0;
  const p = v.phase === "LOST" ? (v.outcome?.phaseReached ?? "PROLOGUE") : v.phase;
  return ORDER.indexOf(p);
}
export const STAGE = { PROLOGUE: 1, POWER: 2, FLOOD: 3, RADIO: 4, CASCADE: 5, ESCAPE: 6, SURVIVED: 7 } as const;

/** The ship's continuous systems (water, grid, valves) are live in this phase. */
export const shipLive = (phase: Phase): boolean => SHIP_PHASES.includes(phase);

/** Latest engineer view, for useFrame (no re-render). */
export function ev(): EngineerView | null {
  const v = useStore.getState().view;
  return v && v.you === "ENGINEER" ? v : null;
}

/** Narrow subscription. `sel` must return a primitive. */
export function useEV<T extends string | number | boolean | null>(sel: (v: EngineerView) => T, fallback: T): T {
  return useStore((s) => (s.view && s.view.you === "ENGINEER" ? sel(s.view) : fallback));
}

/** Narrow subscription returning an array of primitives (shallow-compared). */
export function useEVs<T extends (string | number | boolean | null)[]>(sel: (v: EngineerView | null) => T): T {
  return useStore(useShallow((s) => sel(s.view && s.view.you === "ENGINEER" ? s.view : null)));
}

/** Phase name + how far along, for "is this station live / done / not yet". */
export function useStage(): { phase: Phase; stage: number } {
  const [phase, stage] = useEVs((v) => [v?.phase ?? "LOBBY", stageOf(v)] as [Phase, number]);
  return { phase, stage };
}

// ------------------------------------------------------------ textures

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Painted bulkhead: panel seams, rivet rows, dark lower band. One tile = 2 m wide, full wall height. */
function drawBulkhead(ctx: CanvasRenderingContext2D): void {
  const W = 256;
  const H = 384;
  ctx.fillStyle = PALETTE.bulkhead;
  ctx.fillRect(0, 0, W, H);
  const band = H * 0.7;
  ctx.fillStyle = PALETTE.bulkheadLow;
  ctx.fillRect(0, band, W, H - band);
  ctx.fillStyle = PALETTE.hazardYellow;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, band - 4, W, 4);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.beginPath();
  ctx.moveTo(0, H * 0.35);
  ctx.lineTo(W, H * 0.35);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (const y of [8, H * 0.35 - 8, H * 0.35 + 8, band - 12]) {
    for (let x = 12; x < W; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // grime
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 10, 2 + Math.random() * 18);
  }
}

function drawDeck(ctx: CanvasRenderingContext2D): void {
  const S = 256;
  ctx.fillStyle = PALETTE.deck;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  ctx.fillStyle = PALETTE.deckPlate;
  for (let y = 10; y < S; y += 20) {
    for (let x = 10 + ((y / 20) % 2) * 10; x < S; x += 20) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((x + y) / 20) % 2 ? 0.8 : -0.8);
      ctx.fillRect(-6, -1.5, 12, 3);
      ctx.restore();
    }
  }
}

function drawHazard(ctx: CanvasRenderingContext2D): void {
  const S = 128;
  ctx.fillStyle = PALETTE.hazardBlack;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = PALETTE.hazardYellow;
  for (let i = -2; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, S);
    ctx.lineTo(i * 64 + 32, S);
    ctx.lineTo(i * 64 + 32 + S, 0);
    ctx.lineTo(i * 64 + S, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGrille(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#2a2f31";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#0d0f10";
  for (let y = 8; y < 128; y += 16) ctx.fillRect(10, y, 108, 7);
}

// ------------------------------------------------------------ materials (module singletons)

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (color: string, roughness = 0.75, metalness = 0.15, extra: Partial<MeshStandardMaterial> = {}) =>
    Object.assign(new MeshStandardMaterial({ color, roughness, metalness }), extra);
  const bulkTex = (rx: number) => canvasTex(256, 384, drawBulkhead, [rx, 1]);
  return {
    wall10: dressStd(std("#ffffff", 0.85, 0.1, { map: bulkTex(5) }), "paint", [8, 2.4], 0.8),
    wall8: dressStd(std("#ffffff", 0.85, 0.1, { map: bulkTex(4) }), "paint", [6.4, 2.4], 0.8),
    wall4: dressStd(std("#ffffff", 0.85, 0.1, { map: bulkTex(2) }), "paint", [3.2, 2.4], 0.8),
    deck: dressStd(std("#ffffff", 0.7, 0.45, { map: canvasTex(256, 256, drawDeck, [10, 8]) }), "tread", [10, 8], 1.2),
    ceiling: std(PALETTE.ceiling, 0.9, 0.1),
    beam: std(PALETTE.bulkheadDark, 0.8, 0.2),
    steel: dressStd(std("#59666a", 0.6, 0.4), "paint", [2, 2], 0.5),
    pipe: std(PALETTE.pipe, 0.55, 0.5),
    pipeDark: std(PALETTE.pipeDark, 0.6, 0.5),
    brass: std(PALETTE.brass, 0.35, 0.8),
    brassDark: std(PALETTE.brassDark, 0.45, 0.7),
    enamel: std(PALETTE.enamel, 0.5, 0.2),
    panel: std("#30393b", 0.7, 0.25),
    cabinet: dressStd(std("#4b5d58", 0.7, 0.25), "paint", [2, 2], 0.6),
    valveRed: std(PALETTE.valveRed, 0.5, 0.2),
    lampOff: std(PALETTE.lampOff, 0.4, 0.1),
    rubber: std("#151617", 0.9, 0),
    hazard: std("#ffffff", 0.6, 0.1, { map: canvasTex(128, 128, drawHazard, [1, 1]) }),
    grille: std("#ffffff", 0.8, 0.3, { map: canvasTex(128, 128, drawGrille) }),
    green: std("#2f5d3a", 0.6, 0.2),
  };
}
export function M(): NonNullable<typeof mats> {
  return (mats ??= makeMats());
}

const repeated = new Map<string, MeshStandardMaterial>();
/** A clone of a textured kit material with its own texture repeat (cached),
 * so a wall or deck of any size keeps the same tile scale. */
export function MR(name: "wall10" | "deck", rx: number, ry: number): MeshStandardMaterial {
  const key = `${name}:${rx}:${ry}`;
  let mat = repeated.get(key);
  if (!mat) {
    const base = M()[name];
    mat = base.clone();
    const map = base.map!.clone();
    map.repeat.set(rx, ry);
    map.needsUpdate = true;
    mat.map = map;
    repeated.set(key, mat);
  }
  return mat;
}

// ------------------------------------------------------------ geometries (module singletons)

let geos: ReturnType<typeof makeGeos> | null = null;
function makeGeos() {
  return {
    box: new BoxGeometry(1, 1, 1),
    cyl: new CylinderGeometry(0.5, 0.5, 1, 20),
    cyl8: new CylinderGeometry(0.5, 0.5, 1, 8),
    sphere: new SphereGeometry(0.5, 16, 12),
    torus: new TorusGeometry(0.5, 0.08, 8, 28),
    ring: new TorusGeometry(0.5, 0.025, 6, 40),
  };
}
export function G(): NonNullable<typeof geos> {
  return (geos ??= makeGeos());
}

/** Box from centre + size, sharing one unit geometry. */
export function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={G().box} material={m} position={p} scale={s} rotation={r} />;
}

/** Cylinder (axis Y by default) from centre, diameter, length. */
export function C({ p, d, l, m, r, low }: { p: V3; d: number; l: number; m: Material; r?: V3; low?: boolean }) {
  return <mesh geometry={low ? G().cyl8 : G().cyl} material={m} position={p} scale={[d, l, d]} rotation={r} />;
}

/** Horizontal pipe from a to b (axis-aligned runs only). */
export function Pipe({ a, b, d = 0.1, m }: { a: V3; b: V3; d?: number; m?: Material }) {
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  const len = Math.max(dx, dy, dz);
  const r: V3 = dx === len ? [0, 0, Math.PI / 2] : dz === len ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return <C p={mid} d={d} l={len} m={m ?? M().pipe} r={r} />;
}

// ------------------------------------------------------------ text plates

export const STENCIL = `"Arial Black", Impact, "DejaVu Sans", "Helvetica Neue", Arial, sans-serif`;

/** Draws centred, auto-fitted, multi-line stencil text on a plate. */
export function drawPlate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  o: { bg?: string; fg?: string; border?: string; weight?: string; scale?: number } = {},
): void {
  ctx.fillStyle = o.bg ?? PALETTE.plateBg;
  ctx.fillRect(0, 0, w, h);
  if (o.border) {
    const lw = Math.max(3, Math.min(w, h) * 0.06);
    ctx.strokeStyle = o.border;
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  }
  const lines = text.split("\n");
  const pad = Math.min(w, h) * 0.12;
  let size = ((h - pad * 2) / lines.length) * 0.82 * (o.scale ?? 1);
  ctx.font = `${o.weight ?? "900"} ${size}px ${STENCIL}`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > w - pad * 2) size *= (w - pad * 2) / widest;
  ctx.font = `${o.weight ?? "900"} ${size}px ${STENCIL}`;
  ctx.fillStyle = o.fg ?? PALETTE.plateText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = (h - pad * 2) / lines.length;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, pad + lh * (i + 0.5) + size * 0.04));
}

export type PlateProps = {
  text: string;
  w: number;
  h: number;
  position?: V3;
  rotation?: V3;
  bg?: string;
  fg?: string;
  border?: string;
  /** emissive self-light so labels stay legible in the dark prologue */
  glow?: number;
  scale?: number;
};

/** A flat stencilled label plate (canvas texture, redrawn only when the text changes). */
export function Plate({ text, w, h, position, rotation, bg, fg, border, glow = 0.45, scale }: PlateProps) {
  const cw = Math.min(1024, Math.max(64, Math.round(w * 800)));
  const ch = Math.max(32, Math.round((cw * h) / w));
  const tex = useCanvasTexture(cw, ch, (ctx, W, H) => drawPlate(ctx, W, H, text, { bg, fg, border, scale }), [text, bg, fg, border, scale]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={glow} roughness={0.85} />
    </mesh>
  );
}

/** A canvas-textured plane with an arbitrary draw function. */
export function CanvasPlane({
  w,
  h,
  px = 512,
  draw,
  deps,
  position,
  rotation,
  glow = 0.45,
  transparent,
}: {
  w: number;
  h: number;
  px?: number;
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  deps: unknown[];
  position?: V3;
  rotation?: V3;
  glow?: number;
  transparent?: boolean;
}) {
  const ch = Math.round((px * h) / w);
  const tex = useCanvasTexture(px, ch, draw, deps);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={glow}
        roughness={0.85}
        transparent={transparent}
      />
    </mesh>
  );
}

/** Groups children at a position/rotation (readability shorthand). */
export function At({ p, r, children }: { p: V3; r?: V3; children: ReactNode }) {
  return (
    <group position={p} rotation={r}>
      {children}
    </group>
  );
}

/** Stable no-arg memo for one-off materials owned by a component. */
export function useStdMaterial(color: string, opts: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.assign(new MeshStandardMaterial({ color }), opts), [color]);
}
