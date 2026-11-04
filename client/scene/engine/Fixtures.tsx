// Light fittings, contact shading and fake light shafts for the Engine Room
// and the Aux Machinery Room. Mounted once by Lighting.tsx, which owns the
// light state; this file only reads it (`fixtureState`), never the store
// directly, and holds no React state.
//
//  - fluorescent fittings: twin tubes (unlit HDR material, so bloom catches
//    them) in a steel housing hung from the deckhead, one per work light;
//  - caged bulkhead lamps (warm glass) and caged red emergency domes;
//  - contact shadows: one shared radial blob texture stretched under
//    machinery, tanks, cabinets and the generators so they sit on the deck;
//  - light shafts: crossed additive cards under each fitting and the
//    skylight hatches, high quality tier only. One mesh, one material; each
//    shaft's brightness is a vertex colour rewritten per frame.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, type Material, type Mesh } from "three";
import { useStore } from "../../store.ts";
import { D } from "./dressMats.ts";
import { M } from "./kit.tsx";
import { AT, AUX, AUX_AT, AUX_CX, AUX_CZ, SHIP_PANEL_AT } from "./layout.ts";
import { Kit } from "./mergeKit.tsx";

type V3 = [number, number, number];
const PI = Math.PI;

/** Live, eased light state written by Lighting.tsx every frame. */
export const fixtureState = {
  /** Engine Room working fittings 0..1 (0 when shed / grid down) */
  work: 0,
  /** Engine Room emergency lamps 0..1 */
  emerg: 0,
  /** Aux room working light 0..1 (follows the grid, not the LIGHTS circuit) */
  aux: 0,
  /** shared flicker multiplier (danger dropouts, trip dips) */
  flicker: 1,
  /** the working light's current tint */
  tint: new Color("#ffe2b0"),
};

/** Engine Room fluorescent fittings [x, z] at the deckhead (each has a work light in Lighting.tsx). */
export const FITTINGS: [number, number][] = [
  [-2.6, -1.6],
  [0.6, -1.6],
  [3.4, -1.2],
  [-2.0, 2.0],
  [1.6, 2.0],
];
/** which fitting has the tired tube */
const BAD_TUBE = 2;
export const FITTING_Y = 2.64;

/** Caged bulkhead lamps [x, y, z, rotY] (faces local +z). */
const ENGINE_CAGED: [number, number, number, number][] = [
  [-4.0, 2.2, -3.96, 0],
  [4.0, 2.2, -3.96, 0],
  [4.96, 2.3, 2.35, -PI / 2],
];
const AUX_CAGED: [number, number, number, number][] = [
  [-9.6, 2.3, AUX.maxZ - 0.04, PI],
  [AUX.wallW - 0.04, 2.2, -0.62, -PI / 2],
];
/** Aux room red emergency domes (lit when the grid is down). */
export const AUX_EMERGENCY: [number, number, number, number][] = [
  [-7.6, 2.4, AUX.minZ + 0.02, 0],
  [AUX.minX + 0.02, 2.45, 2.85 - 0.6, PI / 2],
];

// ---------------------------------------------------------------- static fittings

function fluorescent(k: Kit, x: number, z: number, bad: boolean) {
  const m = M();
  const d = D();
  const y = FITTING_Y;
  // drop rods to the deckhead
  for (const dx of [-0.45, 0.45]) k.box(m.steel, [x + dx, (y + 3) / 2, z], [0.02, 3 - y, 0.02]);
  // housing with a reflector lip either side
  k.box(m.steel, [x, y + 0.03, z], [1.3, 0.05, 0.26]);
  for (const s of [-1, 1]) k.box(m.steel, [x, y - 0.01, z + s * 0.125], [1.3, 0.06, 0.012], [s * 0.35, 0, 0]);
  k.box(d.white, [x, y + 0.002, z], [1.24, 0.008, 0.22]);
  // twin tubes, lamp-holders at the ends, a wire guard
  for (const s of [-1, 1]) k.cyl(bad && s === 1 ? d.tubeBad : d.tube, [x, y - 0.035, z + s * 0.055], 0.038, 1.14, "x", 8);
  for (const ex of [-0.6, 0.6]) k.box(m.pipeDark, [x + ex, y - 0.03, z], [0.06, 0.06, 0.2]);
  for (const gx of [-0.3, 0, 0.3]) k.box(m.steel, [x + gx, y - 0.07, z], [0.012, 0.012, 0.24]);
}

function cagedLamp(k: Kit, p: V3, ry: number, glass: Material) {
  const m = M();
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // local (lx, ly, lz) with lz out of the wall -> world
  const P = (lx: number, ly: number, lz: number): V3 => [p[0] + lx * c + lz * s, p[1] + ly, p[2] - lx * s + lz * c];
  const axis = Math.abs(s) > 0.5 ? "x" : "z";
  k.box(m.pipeDark, P(0, 0, 0.03), Math.abs(s) > 0.5 ? [0.06, 0.24, 0.2] : [0.2, 0.24, 0.06]);
  k.cyl(m.steel, P(0, 0, 0.07), 0.17, 0.03, axis, 12);
  k.sphere(glass, P(0, 0, 0.11), 0.13, 1.25);
  // cage: a ring and three bars over the glass
  k.torus(m.steel, P(0, 0, 0.12), 0.16, 0.012, axis === "z" ? [0, 0, 0] : [0, PI / 2, 0]);
  for (const ly of [-0.06, 0, 0.06]) k.box(m.steel, P(0, ly, 0.18), Math.abs(s) > 0.5 ? [0.012, 0.012, 0.15] : [0.15, 0.012, 0.012]);
  k.box(m.steel, P(0, 0, 0.185), [0.012, 0.17, 0.012]);
}

/** cage bars over an emergency dome (the dome itself is in Lighting.tsx / below) */
function emergencyCage(k: Kit, p: V3, ry: number) {
  const m = M();
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, ly: number, lz: number): V3 => [p[0] + lx * c + lz * s, p[1] + ly, p[2] - lx * s + lz * c];
  const across: V3 = Math.abs(s) > 0.5 ? [0.012, 0.012, 0.18] : [0.18, 0.012, 0.012];
  for (const ly of [-0.035, 0.035]) k.box(m.steel, P(0, ly, 0.13), across);
  k.box(m.steel, P(0, 0, 0.135), [0.012, 0.12, 0.012]);
}

// ---------------------------------------------------------------- contact shadows

/** [x, z, w, d, yaw] dark blobs on the deck under things that stand on it. */
const BLOBS: [number, number, number, number, number][] = [
  // Engine Room
  [AT.generator[0] + 0.05, AT.generator[2], 1.7, 3.4, 0], // generator No.1
  [AT.switchboard[0], AT.switchboard[2] + 0.3, 3.9, 0.9, 0],
  [AT.busPanel[0], AT.busPanel[2] + 0.2, 1.3, 0.6, 0],
  [AT.statusBoard[0], AT.statusBoard[2] + 0.2, 1.1, 0.5, 0],
  [AT.transmitter[0], AT.transmitter[2] + 0.45, 2.4, 1.3, 0],
  [AT.manifold[0], AT.manifold[2] - 0.3, 4.3, 1.0, 0],
  [4.5, 2.6, 1.0, 1.4, 0], // lube-oil tank
  [3.4, 3.62, 1.9, 0.9, 0], // workbench
  [-4.15, 3.85, 1.1, 0.5, 0], // lifejacket locker
  [AT.escapeWall[0] - 0.4, -1.85, 0.8, 0.8, 0], // hand pump
  [SHIP_PANEL_AT[0] - 0.15, SHIP_PANEL_AT[2], 0.5, 1.1, 0],
  // Aux Machinery Room
  [AUX_AT.machine[0] - 0.05, AUX_AT.machine[2], 3.6, 1.7, 0], // aux generator set
  [AUX_AT.panel[0] + 0.25, AUX_AT.panel[2], 0.8, 2.6, 0], // plant panel
  [-5.8, -1.45, 1.9, 1.9, 0], // aux lube-oil tank
  [-6.8, 3.65, 1.7, 1.0, 0], // aux workbench
  [-9.5, 3.6, 0.9, 0.9, 0], // drums
  [-9.98, 3.66, 0.9, 0.9, 0],
  [AUX.wallW - 0.2, 0.3, 0.6, 1.9, 0], // fire panel
];

// ---------------------------------------------------------------- light shafts

type Shaft = { p: V3; h: number; w: number; kind: "work" | "sky" | "aux"; i: number };
const SHAFTS: Shaft[] = [
  ...FITTINGS.map(([x, z], i): Shaft => ({ p: [x, FITTING_Y - 0.06, z], h: 2.7, w: 1.9, kind: "work", i })),
  { p: [-4.4, 2.92, -3.3], h: 2.9, w: 1.5, kind: "sky", i: 0 },
  { p: [AUX.minX + 0.5, 2.92, -1.45], h: 2.9, w: 1.5, kind: "sky", i: 1 },
  { p: [AUX_CX, 2.8, AUX_CZ], h: 2.7, w: 2.0, kind: "aux", i: 0 },
];
const CARDS = 3; // crossed vertical cards per shaft

function shaftGeometry(): BufferGeometry {
  const n = SHAFTS.length * CARDS;
  const pos = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const col = new Float32Array(n * 4 * 3);
  const idx: number[] = [];
  let v = 0;
  for (const s of SHAFTS) {
    for (let c = 0; c < CARDS; c++) {
      const a = (c / CARDS) * PI + 0.3;
      const dx = (Math.cos(a) * s.w) / 2;
      const dz = (Math.sin(a) * s.w) / 2;
      const [x, y, z] = s.p;
      const quad: [number, number, number, number, number][] = [
        [x - dx, y, z - dz, 0, 0],
        [x + dx, y, z + dz, 1, 0],
        [x + dx, y - s.h, z + dz, 1, 1],
        [x - dx, y - s.h, z - dz, 0, 1],
      ];
      quad.forEach(([qx, qy, qz, u, w], j) => {
        pos.set([qx, qy, qz], (v + j) * 3);
        // canvas row 0 (top of the beam) is v = 1 with flipY
        uv.set([u, 1 - w], (v + j) * 2);
      });
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const WARM_SHAFT = new Color("#ffd9a8");
const SKY_SHAFT = new Color("#8fb4d8");

function Shafts() {
  const ref = useRef<Mesh>(null);
  const geo = useMemo(shaftGeometry, []);
  const tmp = useMemo(() => new Color(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const high = useStore.getState().quality === "high";
    mesh.visible = high;
    if (!high) return;
    const f = fixtureState;
    const col = geo.getAttribute("color") as BufferAttribute;
    let v = 0;
    for (const s of SHAFTS) {
      if (s.kind === "work") tmp.copy(f.tint).lerp(WARM_SHAFT, 0.5).multiplyScalar(0.075 * f.work * f.flicker * (s.i === BAD_TUBE ? badTube.level : 1));
      else if (s.kind === "aux") tmp.copy(WARM_SHAFT).multiplyScalar(0.07 * f.aux);
      else tmp.copy(SKY_SHAFT).multiplyScalar(0.06);
      for (let j = 0; j < CARDS * 4; j++) col.setXYZ(v + j, tmp.r, tmp.g, tmp.b);
      v += CARDS * 4;
    }
    col.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geo} material={D().shaft} renderOrder={2} raycast={() => null} frustumCulled={false} />;
}

/** the tired tube's own stutter (written by Lighting.tsx), 0..1 */
export const badTube = { level: 1 };

// ---------------------------------------------------------------- mount

function useStatic() {
  return useMemo(() => {
    const k = new Kit();
    FITTINGS.forEach(([x, z], i) => fluorescent(k, x, z, i === BAD_TUBE));
    for (const [x, y, z, ry] of ENGINE_CAGED) cagedLamp(k, [x, y, z], ry, D().lampGlass);
    for (const [x, y, z, ry] of AUX_CAGED) cagedLamp(k, [x, y, z], ry, D().auxLampGlass);
    for (const [x, y, z, ry] of AUX_EMERGENCY) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const P = (lz: number): V3 => [x + lz * s, y, z + lz * c];
      k.box(M().steel, P(0.03), Math.abs(s) > 0.5 ? [0.06, 0.14, 0.22] : [0.22, 0.14, 0.06]);
      k.sphere(D().auxEmergGlass, P(0.07), 0.14, 0.72);
    }
    const blobs = new Kit();
    for (const [x, z, w, d, yaw] of BLOBS) blobs.flat(D().blob, [x, 0.008, z], w, d, yaw);
    return { fixtures: k.build(), blobs: blobs.build() };
  }, []);
}

/** cage bars for the Engine Room emergency domes (positions owned by Lighting.tsx) */
export function EmergencyCages({ lamps }: { lamps: [number, number, number, number][] }) {
  const built = useMemo(() => {
    const k = new Kit();
    for (const [x, y, z, ry] of lamps) emergencyCage(k, [x, y, z], ry);
    for (const [x, y, z, ry] of AUX_EMERGENCY) emergencyCage(k, [x, y, z], ry);
    return k.build();
  }, [lamps]);
  useEffect(() => () => built.forEach(([, g]) => g.dispose()), [built]);
  return (
    <group>
      {built.map(([mat, geo], i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
    </group>
  );
}

export function Fixtures() {
  const { fixtures, blobs } = useStatic();
  useEffect(
    () => () => {
      fixtures.forEach(([, g]) => g.dispose());
      blobs.forEach(([, g]) => g.dispose());
    },
    [fixtures, blobs],
  );
  return (
    <group>
      {fixtures.map(([mat, geo], i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
      {/* contact shadows draw before the other transparents (stains, water) */}
      {blobs.map(([mat, geo], i) => (
        <mesh key={`b${i}`} geometry={geo} material={mat} renderOrder={-1} raycast={() => null} />
      ))}
      <Shafts />
    </group>
  );
}
