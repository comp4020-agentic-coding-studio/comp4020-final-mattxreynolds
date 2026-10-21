// Water on the engine-room deck. During FLOOD the height tracks the ENGINE
// BAY level (0..100 → 0..0.6 m); before FLOOD it creeps up with danger; after
// FLOOD it settles to a low film that still rises with danger. Translucent,
// with a gentle vertex ripple (none in reduced motion).

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, DoubleSide, type Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { useStore } from "../../store.ts";
import { PALETTE } from "../palette.ts";
import { ev, stageOf, STAGE } from "./kit.tsx";
import { ROOM } from "./layout.ts";

export const WATER_MAX_M = 0.6;

/** Target water height in metres from the current view. */
export function waterTarget(): number {
  const v = ev();
  if (!v) return 0;
  const stage = stageOf(v);
  const d = v.danger / 100;
  if (stage === STAGE.FLOOD && v.phase !== "LOST") return 0.03 + (v.flood.engineLevel / 100) * (WATER_MAX_M - 0.03);
  if (v.phase === "LOST") return 1.2;
  if (stage < STAGE.FLOOD) return 0.02 + d * 0.3;
  return 0.03 + d * 0.22;
}

export function Water() {
  const ref = useRef<Mesh>(null);
  const h = useRef(0.02);
  const geo = useMemo(() => new PlaneGeometry(ROOM.w, ROOM.d, 40, 32), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(PALETTE.water),
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
        metalness: 0.3,
        side: DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    h.current += (waterTarget() - h.current) * Math.min(1, dt * 0.8);
    mesh.position.y = h.current;
    const reduced = useStore.getState().reducedMotion;
    const t = performance.now() / 1000;
    const pos = geo.attributes.position;
    const arr = pos.array as Float32Array;
    const amp = reduced ? 0 : 0.012 + Math.min(0.02, h.current * 0.04);
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      arr[i + 2] = amp * (Math.sin(x * 2.3 + t * 1.4) + Math.sin(y * 3.1 - t * 1.1) * 0.6);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    mat.opacity = 0.42 + Math.min(0.25, h.current * 0.5);
  });

  return <mesh ref={ref} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null} renderOrder={2} />;
}
