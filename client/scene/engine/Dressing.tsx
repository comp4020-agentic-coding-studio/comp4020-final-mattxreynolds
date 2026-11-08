// Machinery-space dressing for the Engine Room and Aux Machinery Room. All
// static: repeated pieces are merged per material (mergeKit.tsx), so the whole
// layer is a few dozen draw calls. Nothing here is interactive; everything a
// player could bump into has a matching entry in collision.ts. Dressing stays
// against walls / overhead, clear of the walk paths between stations.

import { PALETTE } from "../palette.ts";
import { D } from "./dressMats.ts";
import { B, M, Plate } from "./kit.tsx";
import { AT, AUX, AUX_AT } from "./layout.ts";
import { Kit, Merged } from "./mergeKit.tsx";

type V3 = [number, number, number];
const PI = Math.PI;

const axisOf = (a: V3, b: V3): "x" | "y" | "z" => {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  return dx >= dy && dx >= dz ? "x" : dz >= dy ? "z" : "y";
};

/** Lagged pipe: insulation sleeve, steel bands, flanged ends and hangers to the deckhead. */
function lagged(k: Kit, a: V3, b: V3, d: number, hangTo: number | null, hangEvery = 1.25) {
  const m = M();
  const x = D();
  const ax = axisOf(a, b);
  k.run(x.lag, a, b, d, 12);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const at = (t: number): V3 => [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len, a[2] + ((b[2] - a[2]) * t) / len];
  for (let t = 0.3; t < len; t += 0.55) k.cyl(x.lagBand, at(t), d + 0.02, 0.035, ax, 12);
  if (hangTo !== null) {
    for (let t = hangEvery / 2; t < len; t += hangEvery) {
      const p = at(t);
      k.box(m.steel, [p[0], (p[1] + hangTo) / 2, p[2]], [0.025, hangTo - p[1], 0.025]);
      k.torus(m.steel, p, d + 0.05, 0.02, ax === "x" ? [0, PI / 2, 0] : [0, 0, 0]);
    }
  }
  for (const e of [a, b]) k.cyl(m.pipeDark, e, d * 1.45, 0.05, ax, 12);
}

/** A flange with a ring of bolt heads. */
function flange(k: Kit, p: V3, d: number, axis: "x" | "y" | "z", bolts = 8) {
  const m = M();
  k.cyl(m.pipeDark, p, d * 1.6, 0.045, axis, 14);
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * PI * 2;
    const r = d * 0.62;
    const o: V3 =
      axis === "x"
        ? [p[0], p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r]
        : axis === "y"
          ? [p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r]
          : [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, p[2]];
    k.cyl(m.brassDark, o, 0.022, 0.07, axis, 5);
  }
}

/** Cable tray with cable bundles and hangers, running along x or z. */
function tray(k: Kit, a: V3, b: V3, w: number, top = 3) {
  const m = M();
  const x = D();
  const alongX = a[0] !== b[0];
  const len = alongX ? Math.abs(b[0] - a[0]) : Math.abs(b[2] - a[2]);
  const c: V3 = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
  k.box(m.steel, [c[0], c[1] - 0.01, c[2]], alongX ? [len, 0.02, w] : [w, 0.02, len]);
  for (const s of [-1, 1]) {
    k.box(m.steel, alongX ? [c[0], c[1] + 0.03, c[2] + (s * w) / 2] : [c[0] + (s * w) / 2, c[1] + 0.03, c[2]], alongX ? [len, 0.07, 0.015] : [0.015, 0.07, len]);
  }
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * (w / 5);
    const mat = i === 1 ? x.cableRed : x.cable;
    if (alongX) k.cyl(mat, [c[0], c[1] + 0.025, c[2] + o], 0.035, len, "x", 6);
    else k.cyl(mat, [c[0] + o, c[1] + 0.025, c[2]], 0.035, len, "z", 6);
  }
  const n = Math.max(1, Math.floor(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    const p: V3 = alongX ? [c[0] + t, c[1], c[2]] : [c[0], c[1], c[2] + t];
    k.box(m.steel, [p[0], (p[1] + top) / 2, p[2]], [0.02, top - p[1], 0.02]);
    k.box(m.steel, p, alongX ? [0.03, 0.02, w + 0.04] : [w + 0.04, 0.02, 0.03]);
  }
}

/** Yellow handrail: posts + two rails between two points along x or z. */
function handrail(k: Kit, a: V3, b: V3) {
  const x = D();
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  for (const y of [0.55, 1.0]) k.run(x.yellow, [a[0], y, a[2]], [b[0], y, b[2]], 0.035, 6);
  const n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.cyl(x.yellow, [a[0] + (b[0] - a[0]) * t, 0.5, a[2] + (b[2] - a[2]) * t], 0.035, 1.0, "y", 6);
  }
}

/** Wall ladder with rails along z at x, rungs across z. */
function ladderZ(k: Kit, x0: number, z0: number, h: number) {
  const g = D().galv;
  const m = M();
  for (const dz of [0, 0.4]) k.box(g, [x0, h / 2, z0 + dz], [0.04, h, 0.04]);
  for (let y = 0.3; y < h - 0.1; y += 0.28) k.cyl(g, [x0, y, z0 + 0.2], 0.03, 0.4, "z", 6);
  for (const y of [0.6, h - 0.6]) for (const dz of [0, 0.4]) k.box(m.steel, [x0 + (x0 < -7 ? -0.03 : -0.03), y, z0 + dz], [0.06, 0.05, 0.05]);
}

function hatch(k: Kit, x0: number, z0: number) {
  const m = M();
  const x = D();
  k.box(m.steel, [x0, 2.97, z0], [0.9, 0.06, 0.9]);
  k.box(m.pipeDark, [x0, 2.925, z0], [0.82, 0.03, 0.82]);
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.cyl(x.rust, [x0 + dx, 2.9, z0 + dz], 0.035, 0.1, "y", 6);
}

function extinguisher(k: Kit, p: V3, wallAxis: "x" | "z", sign: 1 | -1) {
  const x = D();
  const m = M();
  k.cyl(x.ext, p, 0.16, 0.5, "y", 12);
  k.cyl(x.ext, [p[0], p[1] + 0.29, p[2]], 0.07, 0.1, "y", 10);
  k.box(m.pipeDark, [p[0], p[1] + 0.37, p[2]], [0.1, 0.05, 0.05]);
  for (const dy of [0.1, -0.15]) {
    k.box(m.steel, [p[0] + (wallAxis === "x" ? sign * 0.08 : 0), p[1] + dy, p[2] + (wallAxis === "z" ? sign * 0.08 : 0)], wallAxis === "x" ? [0.04, 0.05, 0.2] : [0.2, 0.05, 0.04]);
  }
}

// ---------------------------------------------------------------- Engine Room

function engineBuild(k: Kit) {
  const m = M();
  const x = D();
  const h = 3;

  // ---- overhead: cable tray, ventilation trunking, lagged steam lines
  tray(k, [-3.5, 2.86, -2.75], [4.9, 2.86, -2.75], 0.42);
  k.box(x.galv, [0.4, 2.7, 0.3], [9.4, 0.34, 0.5]);
  for (let vx = -4.2; vx < 4.5; vx += 1.6) {
    k.box(m.steel, [vx, 2.7, 0.3], [0.06, 0.4, 0.56]);
    k.box(m.steel, [vx + 0.8, 2.86, 0.3], [0.03, 0.14, 0.03]);
    k.box(m.steel, [vx + 0.8, 2.93, 0.3], [0.2, 0.02, 0.2]);
  }
  lagged(k, [-4.9, 2.45, 1.45], [4.9, 2.45, 1.45], 0.22, h, 1.4);
  lagged(k, [2.2, 2.45, 1.45], [2.2, 2.45, 3.6], 0.16, h, 1.4);
  for (const fx of [-2.0, 0.8, 3.6]) flange(k, [fx, 2.45, 1.45], 0.22, "x");
  // an in-line globe valve on the header (fixed fitting, nothing to turn)
  k.box(m.pipeDark, [-0.6, 2.45, 1.45], [0.22, 0.26, 0.26]);
  k.cyl(m.pipeDark, [-0.6, 2.68, 1.45], 0.05, 0.2, "y", 6);
  k.torus(x.rust, [-0.6, 2.8, 1.45], 0.2, 0.025, [PI / 2, 0, 0]);
  for (const bx of [-4, -2, 0, 2, 4]) k.box(m.beam, [bx, h - 0.2, 0], [0.04, 0.2, 8]);

  // ---- frame feet + plating stiffeners on the long walls
  for (const bx of [-4, -2, 0, 2, 4]) {
    k.box(m.beam, [bx, 0.13, -3.96], [0.16, 0.26, 0.08]);
    k.box(m.beam, [bx, 0.13, 3.96], [0.16, 0.26, 0.08]);
  }
  for (const sz of [-3.97, 3.97]) for (let i = 0; i < 3; i++) k.box(m.pipeDark, [0, 0.9 + i * 0.55, sz], [10, 0.025, 0.02]);
  // conduit along the north wall with junction boxes
  k.run(x.galv, [-5, 2.58, -3.9], [5, 2.58, -3.9], 0.035, 6);
  for (const jx of [-3.0, 0.4, 3.9]) {
    k.box(x.galv, [jx, 2.58, -3.88], [0.22, 0.2, 0.1]);
    for (const dx of [-0.08, 0.08]) k.sphere(m.brassDark, [jx + dx, 2.64, -3.82], 0.03);
    k.run(x.galv, [jx, 2.58, -3.9], [jx, 2.9, -3.9], 0.03, 6);
  }

  // ---- escape trunk: ladder and skylight hatch (west wall, north end)
  ladderZ(k, -4.94, -3.75, 3.0);
  hatch(k, -4.4, -3.3);

  // ---- generator: handrail on the aisle side, drip bund, dark pool
  handrail(k, [-3.55, 0, -2.35], [-3.55, 0, 0.55]);
  k.box(x.oil, [-4.3, 0.022, -0.9], [1.2, 0.044, 3.0]);
  k.flat(x.stain, [-3.2, 0.052, -0.2], 0.9, 1.6, 0.3);

  // ---- deck: recessed hatch, chain, coiled line, stains
  k.box(m.pipeDark, [3.0, 0.012, -1.0], [0.9, 0.016, 0.9]);
  k.box(m.steel, [3.0, 0.02, -1.0], [0.04, 0.012, 0.5]);
  k.box(m.steel, [2.55, 0.02, -1.0], [0.04, 0.012, 0.04]);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    k.torus(x.galv, [3.9 + Math.sin(t * 5) * 0.12, 0.035, -3.2 + t * 0.9], 0.07, 0.022, i % 2 ? [PI / 2, 0, 0.6] : [PI / 2, PI / 2, 0.6]);
  }
  for (let i = 0; i < 4; i++) k.torus(x.khaki, [-3.6, 0.05 + i * 0.045, 3.4], 0.4 - i * 0.05, 0.05, [PI / 2, 0, 0]);
  k.flat(x.stain, [1.8, 0.016, 2.6], 1.4, 1.0, 1.1);
  k.flat(x.stain, [-2.8, 0.016, -2.4], 1.1, 0.8, 2.0);
  k.flat(x.stain, [3.6, 0.016, -2.4], 1.0, 0.7, 0.4);
  k.flat(x.stain, [0.6, 0.016, -1.4], 0.8, 0.8, 0.9);

  // ---- south wall: lifejacket locker, extinguisher, notice board
  k.box(m.cabinet, [-4.15, 1.45, 3.86], [0.8, 1.1, 0.25]);
  k.box(m.pipeDark, [-4.15, 1.45, 3.73], [0.7, 1.0, 0.02]);
  for (let i = 0; i < 6; i++) k.box(m.steel, [-4.15, 1.12 + i * 0.12, 3.72], [0.5, 0.025, 0.012]);
  k.box(x.yellow, [-4.15, 1.45, 3.71], [0.06, 0.2, 0.012]);
  for (const dy of [-0.5, 0.5]) k.box(m.steel, [-4.15, 1.45 + dy, 3.74], [0.8, 0.03, 0.04]);
  extinguisher(k, [1.75, 0.75, 3.86], "z", 1);
  extinguisher(k, [4.85, 0.75, -0.98], "x", 1);

  // ---- lube-oil tank on saddles, east wall south (collision box in collision.ts)
  k.cyl(x.rust, [4.5, 0.82, 2.6], 0.62, 0.8, "z", 16);
  for (const dz of [-0.25, 0.25]) k.box(m.steel, [4.5, 0.22, 2.6 + dz], [0.66, 0.44, 0.06]);
  for (let i = 0; i < 3; i++) k.cyl(x.rust, [4.5, 0.82, 2.38 + i * 0.22], 0.65, 0.03, "z", 16);
  k.cyl(m.pipeDark, [4.5, 1.16, 2.6], 0.12, 0.1, "y", 8);
  k.cyl(m.brass, [4.5, 1.23, 2.6], 0.14, 0.03, "y", 8);
  k.box(x.sight, [4.815, 0.82, 2.6], [0.02, 0.3, 0.05]);
  k.run(m.pipeDark, [4.3, 0.5, 2.9], [4.3, 0.0, 2.9], 0.07, 8);
  flange(k, [4.3, 0.06, 2.9], 0.07, "y", 6);

  // ---- workbench dressing: drawers, vise, pegboard with tools, clutter
  k.box(m.pipeDark, [3.4, 0.5, 3.8], [1.52, 0.5, 0.2]);
  k.box(x.galv, [2.75, 0.97, 3.78], [0.14, 0.09, 0.14]);
  k.run(x.galv, [2.75, 0.97, 3.66], [2.75, 0.97, 3.5], 0.02, 5);
  k.box(x.cork, [3.4, 1.55, 3.97], [1.5, 0.9, 0.025]);
  for (let i = 0; i < 4; i++) {
    const tx = 2.85 + i * 0.35;
    k.box(x.tool, [tx, 1.58, 3.94], [0.035, 0.4, 0.015]);
    k.cyl(x.tool, [tx, 1.82, 3.94], 0.1, 0.02, "z", 8);
    k.box(x.wood, [tx + 0.02, 1.22, 3.94], [0.04, 0.2, 0.02]);
  }
  k.box(x.tool, [3.45, 1.28, 3.94], [0.18, 0.06, 0.03]);
  k.cyl(x.ceramic, [2.5 + 0.12, 0.93, 3.45], 0.08, 0.1, "y", 10); // mug
  k.torus(x.ceramic, [2.67, 0.93, 3.45], 0.06, 0.012, [0, PI / 2, 0]);
  k.box(x.book, [3.35, 0.9, 3.62], [0.3, 0.035, 0.22], [0, 0.2, 0]); // logbook
  k.box(x.paper, [3.35, 0.92, 3.62], [0.27, 0.01, 0.19], [0, 0.2, 0]);
  k.cyl(x.rust, [3.95, 0.96, 3.5], 0.1, 0.13, "y", 8); // oil can
  k.cyl(m.brass, [3.95, 1.04, 3.5], 0.025, 0.05, "y", 5);
  k.box(x.tool, [3.65, 0.9, 3.4], [0.22, 0.02, 0.05], [0, 0.5, 0]);
  // (bulkhead lamps and light fittings: Fixtures.tsx, lit by Lighting.tsx)
}

// ---------------------------------------------------------------- station detail

function stationBuild(k: Kit) {
  const m = M();
  const x = D();
  // -- switchboard cabinet (faces +z)
  {
    const [ox, , oz] = AT.switchboard;
    const hw = 1.63;
    const P = (lx: number, y: number, lz: number): V3 => [ox + lx, y, oz + lz];
    for (const s of [-1, 1]) {
      k.box(m.steel, P(s * (hw + 0.02), 1.2, 0.17), [0.04, 2.4, 0.3]);
      for (const y of [0.7, 1.2, 1.7, 2.2]) k.cyl(m.pipeDark, P(s * (hw - 0.02), y, 0.095), 0.04, 0.16, "y", 6);
      for (let i = 0; i < 7; i++) k.sphere(m.brassDark, P(s * (hw - 0.07), 0.2 + i * 0.35, 0.095), 0.028);
    }
    k.box(m.steel, P(0, 0.52, 0.3), [hw * 2 + 0.05, 0.05, 0.08]);
    for (const lx of [-1.0, 1.0]) {
      k.box(x.galv, P(lx, 2.73, 0.1), [0.2, 0.54, 0.14]);
      k.box(m.pipeDark, P(lx, 2.47, 0.1), [0.25, 0.04, 0.18]);
      for (let i = 0; i < 3; i++) k.cyl(i === 1 ? x.cableRed : x.cable, P(lx - 0.05 + i * 0.05, 2.5, 0.1), 0.03, 0.16, "y", 5);
    }
    for (let i = 0; i < 9; i++) k.cyl(x.copper, P(-1.4 + i * 0.35, 0.55, 0.28), 0.04, 0.05, "y", 6);
    k.box(x.copper, P(-1.52, 0.2, 0.31), [0.04, 0.2, 0.012]);
    k.box(x.copper, P(1.52, 0.2, 0.31), [0.04, 0.2, 0.012]);
  }
  // -- transmitter cabinet: valve tubes, insulator stack, cooling lines into the deck
  {
    const [ox, , oz] = AT.transmitter;
    const P = (lx: number, y: number, lz: number): V3 => [ox + lx, y, oz + lz];
    for (let i = 0; i < 5; i++) {
      const tx = -0.7 + i * 0.3;
      k.cyl(x.white, P(tx, 2.49, 0.45), 0.1, 0.26, "y", 10);
      k.sphere(x.sight, P(tx, 2.64, 0.45), 0.1);
      k.cyl(m.brass, P(tx, 2.37, 0.45), 0.13, 0.03, "y", 10);
    }
    for (let i = 0; i < 5; i++) k.cyl(x.ceramic, P(0.8, 2.4 + i * 0.12, 0.3), 0.14 - (i % 2) * 0.04, 0.07, "y", 10);
    k.box(x.copper, P(-0.97, 0.9, 0.3), [0.02, 1.7, 0.1]);
    k.cyl(x.cable, P(-1.0, 1.2, 0.45), 0.05, 2.4, "y", 6);
    for (let i = 0; i < 8; i++) k.box(m.pipeDark, P(0.96, 0.4 + i * 0.07, 0.3), [0.012, 0.025, 0.4]);
    // cooling-water feed: flanged pipe with a fixed gate valve, into the deck
    k.run(m.pipe, P(-0.7, 0.5, 0.66), P(-0.7, 0.0, 0.66), 0.07, 8);
    flange(k, P(-0.7, 0.05, 0.66), 0.07, "y", 6);
    k.box(m.pipeDark, P(-0.7, 0.32, 0.66), [0.13, 0.12, 0.13]);
    k.cyl(m.brass, P(-0.7, 0.44, 0.66), 0.03, 0.08, "y", 6);
  }
  // -- manifold (faces -z: world x = ox - lx, world z = oz - lz)
  {
    const [ox, , oz] = AT.manifold;
    const P = (lx: number, y: number, lz: number): V3 => [ox - lx, y, oz - lz];
    for (const lx of [-1.7, -0.58, 0.58, 1.7]) {
      k.run(m.pipe, P(lx, 0.3, 0.25), P(lx, 0.0, 0.25), 0.12, 10);
      flange(k, P(lx, 0.17, 0.25), 0.12, "y", 6);
      k.cyl(m.pipeDark, P(lx, 0.02, 0.25), 0.26, 0.04, "y", 12);
      for (let i = 0; i < 6; i++) k.sphere(m.brassDark, P(lx + Math.cos(i * 1.05) * 0.115, 0.045, 0.25 + Math.sin(i * 1.05) * 0.115), 0.03);
    }
    for (const lx of [-1.15, 0, 1.15]) flange(k, P(lx, 0.3, 0.25), 0.2, "x", 10);
    for (const lx of [-1.15, 0, 1.15]) k.box(m.steel, P(lx, 0.7, 0.17), [0.2, 0.05, 0.1]);
    k.box(m.pipeDark, P(-1.95, 0.3, 0.25), [0.12, 0.26, 0.26]);
    flange(k, P(-1.88, 0.3, 0.25), 0.2, "x", 10);
    k.cyl(m.pipeDark, P(-2.05, 0.3, 0.25), 0.16, 0.06, "x", 12);
    k.cyl(m.brass, P(-1.95, 0.46, 0.25), 0.04, 0.08, "y", 6);
    k.box(m.steel, P(0, 0.28, 0.1), [3.7, 0.06, 0.06]);
    k.box(m.steel, P(0, 2.32, 0.1), [3.7, 0.06, 0.06]);
    for (const lx of [-1.8, -0.58, 0.58]) k.box(m.steel, P(lx, 1.3, 0.1), [0.05, 2.0, 0.05]);
  }
}

// ---------------------------------------------------------------- Aux Machinery Room

function auxBuild(k: Kit) {
  const m = M();
  const x = D();
  const { minX, maxX, minZ, maxZ, h } = AUX;
  // overhead: ventilation trunking, lagged steam line, cable tray
  k.box(x.galv, [-7.7, 2.62, 0.3], [AUX.maxX - AUX.minX - 0.3, 0.36, 0.46]);
  for (let vx = -9.7; vx < -5.6; vx += 1.4) k.box(m.steel, [vx, 2.62, 0.3], [0.06, 0.4, 0.5]);
  lagged(k, [minX + 0.1, 2.35, 3.4], [maxX - 0.05, 2.35, 3.4], 0.2, h, 1.3);
  for (const fx of [-8.5, -6.3]) flange(k, [fx, 2.35, 3.4], 0.2, "x");
  tray(k, [minX + 0.1, 2.9, -0.6], [maxX - 0.1, 2.9, -0.6], 0.36);

  for (const bx of [-9.3, -7.3]) {
    k.box(m.beam, [bx, 0.13, minZ + 0.04], [0.16, 0.26, 0.08]);
    k.box(m.beam, [bx, 0.13, maxZ - 0.04], [0.16, 0.26, 0.08]);
    k.box(m.beam, [bx, h - 0.2, 1], [0.04, 0.2, 6]);
  }
  for (const sz of [minZ + 0.02, maxZ - 0.02]) for (let i = 0; i < 3; i++) k.box(m.pipeDark, [-7.8, 0.9 + i * 0.55, sz], [5, 0.025, 0.02]);

  // lube-oil tank, north-east corner (collision box in collision.ts)
  k.cyl(x.rust, [-5.8, 0.75, -1.45], 0.7, 1.0, "y", 18);
  k.cyl(x.rust, [-5.8, 1.26, -1.45], 0.74, 0.04, "y", 18);
  for (let i = 0; i < 3; i++) k.cyl(x.rust, [-5.8, 0.4 + i * 0.35, -1.45], 0.73, 0.03, "y", 18);
  k.box(m.steel, [-5.8, 0.12, -1.45], [0.82, 0.24, 0.82]);
  k.cyl(m.pipeDark, [-5.8, 1.32, -1.45], 0.14, 0.1, "y", 8);
  k.cyl(m.brass, [-5.8, 1.38, -1.45], 0.16, 0.03, "y", 8);
  k.box(x.sight, [-5.44, 0.75, -1.45], [0.02, 0.5, 0.06]);
  k.run(m.pipeDark, [-6.1, 0.8, -1.45], [-6.38, 0.8, -1.45], 0.06, 6);

  // workbench, south wall under the crew notice (collision box)
  const bx = -6.8;
  const bz = 3.65;
  k.box(x.wood, [bx, 0.9, bz], [1.3, 0.05, 0.6]);
  for (const dx of [-0.6, 0.6]) k.box(m.steel, [bx + dx, 0.45, bz], [0.05, 0.9, 0.55]);
  k.box(m.pipeDark, [bx, 0.5, bz], [1.15, 0.5, 0.5]);
  for (const dx of [-0.3, 0.3]) k.box(m.brass, [bx + dx, 0.62, bz - 0.26], [0.1, 0.02, 0.02]);
  k.box(x.tool, [bx + 0.35, 0.945, bz - 0.1], [0.28, 0.03, 0.05], [0, 0.4, 0]);
  k.cyl(x.ceramic, [bx - 0.45, 0.99, bz + 0.05], 0.08, 0.1, "y", 10);
  k.box(x.book, [bx - 0.1, 0.94, bz - 0.05], [0.28, 0.04, 0.2], [0, -0.3, 0]);
  k.box(x.paper, [bx - 0.1, 0.962, bz - 0.05], [0.25, 0.01, 0.17], [0, -0.3, 0]);
  k.cyl(x.rust, [bx + 0.5, 0.99, bz + 0.1], 0.1, 0.13, "y", 8);

  // lifejacket locker on the west wall south of the panel (collision box)
  k.box(m.cabinet, [minX + 0.13, 1.5, 2.85], [0.25, 1.0, 0.6]);
  k.box(m.pipeDark, [minX + 0.27, 1.5, 2.85], [0.02, 0.9, 0.5]);
  for (const y of [1.2, 1.45, 1.7]) k.box(x.jacket, [minX + 0.285, y, 2.85], [0.01, 0.2, 0.4]);
  // extinguisher and first-aid box on the bulkhead south of the door
  extinguisher(k, [maxX - 0.15, 0.75, 3.35], "x", 1);
  k.box(x.safetyGreen, [maxX - 0.05, 1.5, 3.45], [0.1, 0.3, 0.3]);
  k.box(x.white, [maxX - 0.105, 1.5, 3.45], [0.01, 0.18, 0.05]);
  k.box(x.white, [maxX - 0.105, 1.5, 3.45], [0.01, 0.05, 0.18]);

  // escape trunk: ladder and hatch at the north end of the west wall
  ladderZ(k, minX + 0.07, -1.65, 3.0);
  hatch(k, minX + 0.5, -1.45);

  // aux set: bund, handrail (collision box), stains, chain
  k.box(x.oil, [AUX_AT.machine[0], 0.022, AUX_AT.machine[2]], [3.1, 0.044, 1.2]);
  handrail(k, [AUX_AT.machine[0] - 1.5, 0, AUX_AT.machine[2] + 0.75], [AUX_AT.machine[0] + 0.5, 0, AUX_AT.machine[2] + 0.75]);
  k.flat(x.stain, [-8.4, 0.016, 1.4], 1.3, 0.9, 0.5);
  k.flat(x.stain, [-6.6, 0.016, 2.4], 1.0, 0.8, 1.9);
  k.flat(x.stain, [AUX_AT.machine[0] + 0.3, 0.05, AUX_AT.machine[2] + 0.62], 1.2, 0.3, 0);
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    k.torus(x.galv, [-8.8 + t * 0.7, 0.035, 2.5 + Math.sin(t * 4) * 0.12], 0.07, 0.022, i % 2 ? [PI / 2, 0, 0.5] : [PI / 2, PI / 2, 0.5]);
  }
  k.run(x.galv, [minX, 2.5, minZ + 0.04], [maxX, 2.5, minZ + 0.04], 0.035, 6);
}

// ---------------------------------------------------------------- signage

function Signage() {
  const skip = [-2.28, -0.28];
  return (
    <group>
      {[-4, -2, 0, 2, 4].map((x, i) => (
        <group key={x}>
          <Plate text={`FR ${54 + i * 2}`} w={0.3} h={0.1} position={[x + 0.28, 2.35, -3.975]} bg="#2a3234" fg="#cfd6d2" glow={0.35} />
          {!skip.includes(x - 0.28) && <Plate text={`FR ${54 + i * 2}`} w={0.3} h={0.1} position={[x - 0.28, 2.35, 3.975]} rotation={[0, PI, 0]} bg="#2a3234" fg="#cfd6d2" glow={0.35} />}
        </group>
      ))}
      <Plate text={"LIFEJACKETS"} w={0.5} h={0.09} position={[-4.15, 2.06, 3.97]} rotation={[0, PI, 0]} border={PALETTE.hazardYellow} glow={0.55} />
      <Plate text={"FIRE\nEXTINGUISHER"} w={0.3} h={0.15} position={[1.75, 1.3, 3.975]} rotation={[0, PI, 0]} bg="#7a1a14" fg="#f4eee0" glow={0.5} />
      <Plate text={"LUBE OIL\nTANK · 400 L"} w={0.4} h={0.16} position={[4.97, 1.55, 2.6]} rotation={[0, -PI / 2, 0]} border={PALETTE.brass} glow={0.55} />
      <Plate text={"ESCAPE TRUNK\nUP"} w={0.56} h={0.16} position={[-4.97, 2.4, -2.95]} rotation={[0, PI / 2, 0]} bg="#1d5a33" fg="#f4eee0" glow={0.6} />
      <Plate text={"NO SMOKING"} w={0.4} h={0.07} position={[-3.25, 2.2, 3.975]} rotation={[0, PI, 0]} bg="#7a1a14" fg="#f4eee0" glow={0.45} />
      <B p={[-2.7, 1.65, 3.975]} s={[0.55, 0.7, 0.02]} m={D().cork} />
      <Plate text={"WATCH BILL\n\n00-04 OKONJO\n04-08 BRANDT\n08-12 OKONJO\n\nLOG THE BILGES"} w={0.34} h={0.5} position={[-2.7, 1.66, 3.96]} rotation={[0, PI, 0]} bg="#e9e2cc" fg="#1b1b1b" glow={0.35} />
      <Plate text={"CAUTION\nHOT SURFACES"} w={0.45} h={0.2} position={[-4.97, 2.1, -0.9]} rotation={[0, PI / 2, 0]} border={PALETTE.hazardYellow} glow={0.55} />
    </group>
  );
}

function AuxSignage() {
  return (
    <group>
      {[-9.3, -7.3].map((x, i) => (
        <Plate key={x} text={`FR ${60 + i * 2}`} w={0.3} h={0.1} position={[x + 0.28, 2.35, AUX.maxZ - 0.02]} rotation={[0, PI, 0]} bg="#2a3234" fg="#cfd6d2" glow={0.35} />
      ))}
      <Plate text={"LUBE OIL\nTANK · 250 L"} w={0.42} h={0.16} position={[-5.8, 1.75, -1.97]} border={PALETTE.brass} glow={0.55} />
      <Plate text={"LIFEJACKETS"} w={0.5} h={0.09} position={[AUX.minX + 0.02, 2.15, 2.85]} rotation={[0, PI / 2, 0]} border={PALETTE.hazardYellow} glow={0.55} />
      <Plate text={"FIRST AID"} w={0.28} h={0.07} position={[AUX.maxX - 0.11, 1.28, 3.45]} rotation={[0, -PI / 2, 0]} bg="#2a6a3c" fg="#f4eee0" glow={0.5} />
      <Plate text={"ESCAPE TRUNK UP"} w={0.5} h={0.08} position={[AUX.minX + 0.02, 2.55, -1.2]} rotation={[0, PI / 2, 0]} bg="#1d5a33" fg="#f4eee0" glow={0.6} />
      <Plate text={"NO NAKED LIGHTS"} w={0.4} h={0.07} position={[-9.0, 2.3, -1.97]} bg="#7a1a14" fg="#f4eee0" glow={0.45} />
    </group>
  );
}

export function EngineDressing() {
  return (
    <group>
      <Merged build={engineBuild} />
      <Merged build={stationBuild} />
      <Signage />
    </group>
  );
}

/** Diesel detail: n cylinders from x = cx (0.4 m pitch), authored along +x facing +z. */
function dieselBuild(k: Kit, cx: number, n: number, yTop: number) {
  const m = M();
  const x = D();
  const step = 0.4;
  for (let i = 0; i < n; i++) {
    const px = cx + i * step;
    k.box(x.safetyGreen, [px, yTop, 0], [0.3, 0.1, 0.46]); // rocker cover
    k.box(m.steel, [px, yTop + 0.06, 0], [0.34, 0.03, 0.5]);
    for (const dz of [-0.2, 0.2]) k.sphere(m.brass, [px, yTop + 0.09, dz], 0.04);
    k.cyl(m.brass, [px, yTop + 0.14, 0], 0.05, 0.1, "y", 8); // injector
    k.run(x.copper, [px, yTop + 0.15, 0], [px, yTop + 0.15, 0.27], 0.018, 5);
    k.run(x.copper, [px, yTop + 0.15, 0.27], [px, yTop - 0.4, 0.27], 0.018, 5);
    k.cyl(m.pipe, [px, yTop - 0.18, 0.3], 0.1, 0.2, "z", 10); // intake runner
    k.cyl(m.pipeDark, [px, yTop - 0.22, -0.4], 0.1, 0.16, "z", 10); // exhaust stub
  }
  const x0 = cx - 0.2;
  const x1 = cx + (n - 1) * step + 0.2;
  k.run(m.pipe, [x0, yTop - 0.18, 0.43], [x1, yTop - 0.18, 0.43], 0.14, 12);
  k.run(x.lag, [x0, yTop - 0.22, -0.5], [x1, yTop - 0.22, -0.5], 0.22, 12);
  for (let i = 0; i <= n; i++) {
    k.box(m.pipeDark, [cx - 0.2 + i * step, 0.7, 0.415], [0.04, 0.8, 0.02]);
    for (let j = 0; j < 3; j++) k.sphere(m.brass, [cx - 0.2 + i * step, 0.4 + j * 0.3, 0.43], 0.03);
  }
  k.cyl(x.jacket, [x1 + 0.3, 0.5, 0.46], 0.14, 0.3, "y", 12); // oil filters
  k.cyl(x.jacket, [x1 + 0.5, 0.5, 0.46], 0.14, 0.3, "y", 12);
  k.run(x.tool, [x0 + 0.1, 1.15, 0.43], [x0 + 0.1, 0.8, 0.43], 0.015, 5); // dipstick
  k.run(m.steel, [x0, yTop + 0.2, 0.12], [x1, yTop + 0.2, 0.12], 0.02, 5); // control rack
}

export function GeneratorDetail() {
  return <Merged build={(k) => dieselBuild(k, -0.85, 4, 1.62)} />;
}
export function AuxGeneratorDetail() {
  return <Merged build={(k) => dieselBuild(k, -1.05, 4, 1.53)} />;
}

export function AuxDressing() {
  return (
    <group>
      <Merged build={auxBuild} />
      <AuxSignage />
    </group>
  );
}
