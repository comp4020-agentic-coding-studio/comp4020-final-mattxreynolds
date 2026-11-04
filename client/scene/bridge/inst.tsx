// Instancing helper for repeated dressing (screws, rungs, posts): one draw
// call per call site. Matrices are written once at mount.

import { useLayoutEffect, useRef } from "react";
import { Color, Euler, type InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from "three";

export type Item = { p: [number, number, number]; s: [number, number, number] | number; r?: [number, number, number]; c?: string };

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const v = new Vector3();
const sc = new Vector3();
const col = new Color();

export function Instanced({ geo, mat, items, position, rotation }: { geo: BufferGeometry; mat: Material; items: Item[]; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    items.forEach((it, i) => {
      e.set(...(it.r ?? [0, 0, 0]));
      q.setFromEuler(e);
      v.set(...it.p);
      if (typeof it.s === "number") sc.set(it.s, it.s, it.s);
      else sc.set(...it.s);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
      if (it.c) mesh.setColorAt(i, col.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} position={position} rotation={rotation} frustumCulled={false} />;
}
