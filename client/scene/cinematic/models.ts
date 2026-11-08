// Procedural geometry for the cinematics: a lofted cargo-ship hull with sheer,
// flare and a raked stem; the superstructure merged into a few meshes (one
// per material); window/porthole instances; the enclosed lifeboat. Built once
// per mount, disposed on unmount. Ship axes: +x forward, +y up, +z starboard.

import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const HULL = { keel: -1.7, beam: 2.4 };

/** Main-deck height at hull station s (0 stern … 1 stem): sheer rising to a forecastle. */
export const deckY = (s: number): number => 1.9 + 0.35 * (s - 0.45) ** 2 + 0.9 * Math.max(0, (s - 0.84) / 0.16) ** 2;
const xMin = (v: number) => -11.4 - 0.6 * v; // counter stern overhangs aft
const xMax = (v: number) => 12.4 + 1.9 * v; // raked stem
/** Half-breadth at station s, height fraction v (0 keel … 1 deck). */
export function halfBreadth(s: number, v: number): number {
  const fore = s > 0.66 ? Math.max(0, (1 - s) / 0.34) : 1;
  const flare = fore ** (0.95 - 0.5 * v); // fuller near the deck: the bow flares
  const aft = s < 0.12 ? 0.72 + 0.28 * Math.sqrt(s / 0.12) : 1;
  const bilge = v < 0.25 ? 0.55 + 0.45 * Math.sin((v / 0.25) * (Math.PI / 2)) : 1;
  return HULL.beam * flare * (0.55 + 0.45 * Math.min(1, aft + v * 0.3)) * bilge;
}
/** Station s for a ship-x at deck height. */
export const stationAt = (x: number, v = 1): number => (x - xMin(v)) / (xMax(v) - xMin(v));

const C = {
  bottom: new Color("#6b1c14"),
  boot: new Color("#c8c3b6"),
  side: new Color("#3a434b"),
  rail: new Color("#9a978e"),
  deck: new Color("#4a3e35"),
};

function hullPoint(s: number, v: number, side: number): [number, number, number] {
  const x = xMin(v) + s * (xMax(v) - xMin(v));
  const y = HULL.keel + v * (deckY(s) - HULL.keel);
  return [x, y, side * halfBreadth(s, v)];
}

/** The hull shell, deck and transom, vertex-coloured (antifouling, boot-top, topsides, rail). */
export function hullGeometry(): BufferGeometry {
  const S = 56;
  const V = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const colour = (y: number, v: number): Color => (v > 0.965 ? C.rail : y < 0.02 ? C.bottom : y < 0.16 ? C.boot : C.side);
  // shell: per station a strip from port deck edge down round the keel and up to starboard
  const ring = 2 * V;
  for (let i = 0; i <= S; i++) {
    const s = i / S;
    for (let j = 0; j < ring; j++) {
      const port = j < V;
      const v = port ? 1 - j / (V - 1) : (j - V) / (V - 1);
      const p = hullPoint(s, v, port ? -1 : 1);
      pos.push(...p);
      const c = colour(p[1], v);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // deck: its own vertices so the deck edge stays crisp
  const d0 = pos.length / 3;
  for (let i = 0; i <= S; i++) {
    const s = i / S;
    for (const side of [-1, 1]) {
      const p = hullPoint(s, 1, side);
      pos.push(p[0], p[1] - 0.04, p[2] * 0.97);
      col.push(C.deck.r, C.deck.g, C.deck.b);
    }
  }
  for (let i = 0; i < S; i++) {
    const a = d0 + i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // transom: a fan across the stern section
  const t0 = pos.length / 3;
  pos.push(xMin(0.6), 0.4, 0);
  col.push(C.side.r, C.side.g, C.side.b);
  for (let j = 0; j < ring; j++) {
    pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
    const c = colour(pos[j * 3 + 1], j < V ? 1 - j / (V - 1) : (j - V) / (V - 1));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < ring - 1; j++) idx.push(t0, t0 + 2 + j, t0 + 1 + j);
  idx.push(t0, t0 + 1, t0 + ring); // close across the deck
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- a tiny kit: transformed primitives merged per material ---------------------

const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 14);
const m4 = new Matrix4();
const q = new Quaternion();
const e3 = new Vector3();

class Kit {
  parts: BufferGeometry[] = [];
  /** box from min corner to max corner */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rot?: [number, number, number]): this {
    const g = BOX.clone();
    if (rot) g.applyMatrix4(m4.makeRotationFromEuler(eulerOf(rot)));
    g.applyMatrix4(m4.compose(e3.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q.identity(), new Vector3(x1 - x0, y1 - y0, z1 - z0)));
    this.parts.push(g);
    return this;
  }
  /** a box of size (sx, sy, sz) rotated about its own centre: a true rotation,
   * unlike `box`'s `rot`, which turns the unit cube before stretching it */
  slab(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rot: [number, number, number]): this {
    const g = BOX.clone();
    g.scale(sx, sy, sz);
    g.applyMatrix4(m4.makeRotationFromEuler(eulerOf(rot)));
    g.translate(cx, cy, cz);
    this.parts.push(g);
    return this;
  }
  /** cylinder (y-axis) at a centre, radii, height, optional tilt */
  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, rot: [number, number, number] = [0, 0, 0], squashZ = 1): this {
    const g = new CylinderGeometry(rTop, rBot, h, 14);
    g.scale(1, 1, squashZ);
    g.applyMatrix4(m4.makeRotationFromEuler(eulerOf(rot)));
    g.translate(x, y, z);
    this.parts.push(g);
    return this;
  }
  /** a thin beam from a to b */
  rod(a: [number, number, number], b: [number, number, number], r: number): this {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const len = va.distanceTo(vb);
    const g = CYL.clone();
    g.scale(r, len, r);
    q.setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(m4.compose(va.add(vb).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
    this.parts.push(g);
    return this;
  }
  build(): BufferGeometry {
    const g = mergeGeometries(this.parts.map((p) => p.toNonIndexed()), false)!;
    this.parts.forEach((p) => p.dispose());
    return g;
  }
}
const eulerOf = (r: [number, number, number]) => new Euler(r[0], r[1], r[2]);

/** The wheelhouse front is raked: the glazing leans out at the top, as on a
 * real bridge (it sheds spray and kills reflections). RAKE is the lean in
 * radians; BRIDGE_X is the face at mid-window height. */
export const BRIDGE = { rake: 0.2, x: -5.55, midY: 5.45 };
/** The raked bridge face's x at height y (ship coords). */
export const bridgeFaceX = (y: number): number => BRIDGE.x + (y - BRIDGE.midY) * Math.tan(BRIDGE.rake);
/** Outward normal of the raked bridge face (it looks slightly down). */
export const BRIDGE_N: [number, number, number] = [Math.cos(BRIDGE.rake), -Math.sin(BRIDGE.rake), 0];

/** Davit heads (ship coords) the lifeboat hangs from on the starboard side. */
export const DAVIT = { x: -8.4, y: 5.0, z: 3.25, span: 1.1 };

/** The ship's superstructure and deck gear, one geometry per material. */
export function shipParts(): Record<"house" | "steel" | "hatch" | "funnel" | "band" | "black" | "glassFrame", BufferGeometry> {
  const house = new Kit();
  // accommodation aft: three tiers, the bridge with wings on top
  house.box(-11.3, 1.85, -2.15, -5.6, 3.4, 2.15);
  house.box(-10.9, 3.4, -1.95, -5.8, 4.75, 1.95);
  house.box(-9.4, 4.75, -2.0, -5.8, 6.1, 2.0);
  // the raked front: a slab pivoted about mid-window height, top leaning forward
  house.slab(bridgeFaceX(5.45) - 0.14 / Math.cos(BRIDGE.rake), 5.45, 0, 0.28, 1.75, 4.0, [0, 0, -BRIDGE.rake]);
  // bridge wings: open platforms running out past the ship's side
  house.box(-6.75, 4.75, -3.35, -5.6, 4.9, 3.35);
  house.box(-6.75, 4.9, 3.15, -5.6, 5.45, 3.35);
  house.box(-6.75, 4.9, -3.35, -5.6, 5.45, -3.15);
  house.box(-5.95, 4.9, -3.35, -5.6, 5.45, 3.35);
  // forecastle bulwark and the poop rail
  house.box(10.6, 2.6, -1.5, 11.0, 3.15, 1.5);
  const steel = new Kit();
  // deck-edge fascia round each tier: a dark proud band where the deck overhangs,
  // so the house reads as stacked decks rather than one block
  const fascia = (x0: number, x1: number, z: number, y: number) => {
    steel.box(x0 - 0.06, y - 0.07, -z - 0.06, x1 + 0.06, y + 0.05, -z + 0.02);
    steel.box(x0 - 0.06, y - 0.07, z - 0.02, x1 + 0.06, y + 0.05, z + 0.06);
    steel.box(x1 - 0.02, y - 0.07, -z - 0.06, x1 + 0.06, y + 0.05, z + 0.06);
    steel.box(x0 - 0.06, y - 0.07, -z - 0.06, x0 + 0.02, y + 0.05, z + 0.06);
  };
  fascia(-11.3, -5.6, 2.15, 3.4);
  fascia(-10.9, -5.8, 1.95, 4.75);
  // rails along the open deck edges of the lower tiers
  for (const [x0, x1, z, y] of [[-11.3, -5.6, 2.15, 3.4], [-10.9, -5.8, 1.95, 4.75]] as const) {
    for (const side of [-1, 1]) steel.box(x0, y + 0.42, side * z - 0.02, x1, y + 0.46, side * z + 0.02);
    steel.box(x1 - 0.02, y + 0.42, -z, x1 + 0.02, y + 0.46, z);
    for (let x = x0 + 0.2; x < x1; x += 0.7) for (const side of [-1, 1]) steel.box(x - 0.02, y, side * z - 0.02, x + 0.02, y + 0.44, side * z + 0.02);
  }
  // wheelhouse: a raked sun visor over the front windows, and chamfered front corners
  steel.box(-5.75, 5.95, -2.1, -5.2, 6.02, 2.1, [0, 0, -0.32]);
  for (const side of [-1, 1]) steel.box(-5.75, 4.75, side * 2.0 - 0.18, -5.45, 6.1, side * 2.0 + 0.18, [0, Math.PI / 4, 0]);
  // wheelhouse roof, radar mast + scanner, foremast with crosstree
  steel.box(-9.6, 6.1, -2.15, -5.35, 6.22, 2.15);
  steel.cyl(-7.6, 7.4, 0, 0.07, 0.09, 2.4);
  steel.box(-7.62, 7.9, -0.9, -7.5, 7.98, 0.9);
  steel.box(-7.9, 8.4, -0.08, -7.3, 8.48, 0.08);
  steel.cyl(10.2, 5.6, 0, 0.07, 0.13, 5.6);
  steel.box(10.15, 7.0, -0.9, 10.25, 7.08, 0.9);
  // cargo cranes between the hatches, port side
  for (const x of [-0.5, 3.6]) {
    steel.cyl(x, 2.9, -1.7, 0.22, 0.26, 2.0);
    steel.box(x - 0.35, 3.9, -2.0, x + 0.35, 4.4, -1.4);
    steel.rod([x, 4.2, -1.7], [x + 3.4, 6.6, -0.6], 0.07);
    steel.rod([x + 0.2, 4.4, -1.7], [x + 3.4, 6.6, -0.6], 0.025);
  }
  // davits: two curved arms each side carry the lifeboats (starboard one occupied)
  for (const side of [1, -1])
    for (const dx of [-DAVIT.span / 2, DAVIT.span / 2]) {
      const x = DAVIT.x + dx;
      steel.rod([x, 3.4, side * 1.95], [x, 4.6, side * 2.45], 0.07);
      steel.rod([x, 4.6, side * 2.45], [x, DAVIT.y, side * DAVIT.z], 0.06);
    }
  // windlass and bitts on the forecastle
  steel.box(11.8, 2.95, -0.7, 12.5, 3.25, 0.7);
  for (const z of [-1, 1]) steel.cyl(11.2, 3.0, z * 1.1, 0.12, 0.12, 0.35);
  // guard rails: thin bars along both sides
  for (const side of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let s = 0.22; s <= 0.95; s += 0.04) {
      const x = -11.4 + s * (14.3 + 11.4);
      pts.push([x, deckY(s) + 0.42, side * halfBreadth(s, 1) * 0.98]);
    }
    for (let i = 0; i < pts.length - 1; i++) steel.rod(pts[i], pts[i + 1], 0.025);
  }
  const hatch = new Kit();
  for (const x of [-2.6, 1.5, 5.6, 8.6]) {
    const w = x > 8 ? 1.2 : 1.6;
    hatch.box(x - 1.55, 1.85, -w, x + 1.55, 2.4, w);
    // cover panels: a ridge per panel break
    for (const dx of [-0.78, 0, 0.78]) hatch.box(x + dx - 0.03, 2.4, -w, x + dx + 0.03, 2.47, w);
  }
  // the funnel: elliptical, raked aft
  const funnel = new Kit().cyl(-9.9, 6.25, 0, 0.78, 0.9, 3.0, [0, 0, 0.13], 0.72);
  const band = new Kit().cyl(-10.13, 7.05, 0, 0.83, 0.86, 0.5, [0, 0, 0.13], 0.73);
  const black = new Kit().cyl(-10.32, 7.7, 0, 0.78, 0.8, 0.32, [0, 0, 0.13], 0.73);
  // window mullions on the bridge front, so the glass reads as panes
  const glassFrame = new Kit();
  const fx = bridgeFaceX(5.55);
  for (let i = 0; i <= 7; i++) glassFrame.slab(fx, 5.55, -1.85 + i * 0.528, 0.06, 0.82, 0.06, [0, 0, -BRIDGE.rake]);
  return {
    house: house.build(),
    steel: steel.build(),
    hatch: hatch.build(),
    funnel: funnel.build(),
    band: band.build(),
    black: black.build(),
    glassFrame: glassFrame.build(),
  };
}

/** One window or porthole: centre, facing normal, size, and its light group. */
export type Pane = { p: [number, number, number]; n: [number, number, number]; w: number; h: number; /** 0 hull ports, 1 accommodation, 2 bridge */ kind: number };

export function shipPanes(): Pane[] {
  const out: Pane[] = [];
  // bridge front: seven big panes
  for (let i = 0; i < 7; i++) out.push({ p: [bridgeFaceX(5.55) + 0.02, 5.55, -1.59 + i * 0.528], n: BRIDGE_N, w: 0.44, h: 0.62, kind: 2 });
  // bridge sides
  for (const side of [-1, 1]) for (const x of [-6.2, -7.0, -7.8, -8.6]) out.push({ p: [x, 5.5, side * 2.01], n: [0, 0, side], w: 0.5, h: 0.48, kind: 2 });
  // accommodation: two decks of square windows, sides and front
  for (const side of [-1, 1]) {
    for (let x = -10.5; x <= -6.2; x += 0.62) out.push({ p: [x, 2.75, side * 2.16], n: [0, 0, side], w: 0.32, h: 0.34, kind: 1 });
    for (let x = -10.2; x <= -6.4; x += 0.62) out.push({ p: [x, 4.1, side * 1.96], n: [0, 0, side], w: 0.32, h: 0.34, kind: 1 });
  }
  for (let z = -1.7; z <= 1.71; z += 0.56) {
    out.push({ p: [-5.59, 2.75, z], n: [1, 0, 0], w: 0.3, h: 0.34, kind: 1 });
    out.push({ p: [-5.79, 4.1, z], n: [1, 0, 0], w: 0.3, h: 0.34, kind: 1 });
  }
  // hull portholes: a row under the accommodation and in the forecastle
  for (const side of [-1, 1]) {
    for (let x = -10.4; x <= -4.6; x += 0.72) {
      const s = stationAt(x, 0.75);
      out.push({ p: [x, 1.15, side * (halfBreadth(s, 0.8) + 0.02)], n: [0, 0, side], w: 0.18, h: 0.18, kind: 0 });
    }
    for (let x = 10.6; x <= 12.4; x += 0.6) {
      const s = stationAt(x, 0.85);
      out.push({ p: [x, 2.0, side * (halfBreadth(s, 0.85) + 0.03)], n: [0, 0, side], w: 0.16, h: 0.16, kind: 0 });
    }
  }
  return out;
}

/** A unit quad for window instances (faces +z). */
export const paneGeometry = (): PlaneGeometry => new PlaneGeometry(1, 1);

/** The enclosed lifeboat: an orange hull with a white canopy, about 2.4 long. */
export function lifeboatParts(): { hull: BufferGeometry; canopy: BufferGeometry } {
  const hull = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(1.25, 0.55, 0.5);
  const top = new Kit().box(-1.05, 0, -0.42, 1.05, 0.12, 0.42).build();
  const canopy = new SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1.0, 0.42, 0.4);
  canopy.translate(-0.05, 0.1, 0);
  const merged = mergeGeometries([hull.toNonIndexed(), top], false)!;
  hull.dispose();
  top.dispose();
  const cap = canopy.toNonIndexed();
  canopy.dispose();
  return { hull: merged, canopy: cap };
}
