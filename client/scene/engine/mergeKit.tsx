// Dressing builder: collects boxes / cylinders / tori / planes per material,
// merges each material's pieces into ONE BufferGeometry, so hundreds of bolts,
// rungs, hangers and cables cost a handful of draw calls.

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type V3 = [number, number, number];
const Y_UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _s = new Vector3();
const _p = new Vector3();

const boxG = new BoxGeometry(1, 1, 1);
const cylCache = new Map<number, CylinderGeometry>();
const cylG = (seg: number) => {
  let g = cylCache.get(seg);
  if (!g) cylCache.set(seg, (g = new CylinderGeometry(0.5, 0.5, 1, seg)));
  return g;
};
const sphG = new SphereGeometry(0.5, 10, 8);
const planeG = new PlaneGeometry(1, 1);

export type Axis = "x" | "y" | "z";
const AXIS_ROT: Record<Axis, V3> = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };

export class Kit {
  parts = new Map<Material, BufferGeometry[]>();

  private put(mat: Material, g: BufferGeometry, p: V3, s: V3, r: V3 = [0, 0, 0]): void {
    _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    const c = g.clone();
    c.applyMatrix4(_m);
    let a = this.parts.get(mat);
    if (!a) this.parts.set(mat, (a = []));
    a.push(c);
  }
  box(mat: Material, p: V3, s: V3, r?: V3): this {
    this.put(mat, boxG, p, s, r);
    return this;
  }
  /** cylinder, diameter d, length l, along axis (default Y) */
  cyl(mat: Material, p: V3, d: number, l: number, axis: Axis = "y", seg = 10): this {
    this.put(mat, cylG(seg), p, [d, l, d], AXIS_ROT[axis]);
    return this;
  }
  /** straight axis-aligned run from a to b */
  run(mat: Material, a: V3, b: V3, d: number, seg = 10): this {
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    const dz = Math.abs(b[2] - a[2]);
    const axis: Axis = dx >= dy && dx >= dz ? "x" : dz >= dy ? "z" : "y";
    return this.cyl(mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d, Math.max(dx, dy, dz), axis, seg);
  }
  sphere(mat: Material, p: V3, d: number, sy = 1): this {
    this.put(mat, sphG, p, [d, d * sy, d], [0, 0, 0]);
    return this;
  }
  /** torus: ring diameter D, tube diameter t; r = rotation (default: ring in XY plane) */
  torus(mat: Material, p: V3, D: number, t: number, r: V3 = [0, 0, 0]): this {
    this.put(mat, new TorusGeometry(0.5, t / D / 2, 5, 14), p, [D, D, D], r);
    return this;
  }
  /** a plane lying flat (facing up) with yaw */
  flat(mat: Material, p: V3, w: number, d: number, yaw = 0): this {
    _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0, "XYZ"));
    const q2 = new Quaternion().setFromAxisAngle(Y_UP, yaw).multiply(_q);
    _m.compose(_p.set(p[0], p[1], p[2]), q2, _s.set(w, d, 1));
    const c = planeG.clone();
    c.applyMatrix4(_m);
    let a = this.parts.get(mat);
    if (!a) this.parts.set(mat, (a = []));
    a.push(c);
    return this;
  }
  build(): [Material, BufferGeometry][] {
    const out: [Material, BufferGeometry][] = [];
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (g) out.push([mat, g]);
    }
    return out;
  }
}

/** Renders one merged mesh per material from a builder function (built once). */
export function Merged({ build }: { build: (k: Kit) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meshes = useMemo(() => {
    const k = new Kit();
    build(k);
    return k.build();
  }, []);
  useEffect(() => () => meshes.forEach(([, g]) => g.dispose()), [meshes]);
  return (
    <group>
      {meshes.map(([mat, geo], i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
    </group>
  );
}
