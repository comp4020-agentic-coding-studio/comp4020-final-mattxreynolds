// Water on the engine-room deck (and in the Aux Machinery Room once its door
// is open: same compartment). From FLOOD to ESCAPE the water is live and the
// height tracks the ENGINE compartment level (0..100 → 0..0.6 m); a lost
// ENGINE compartment stands deep (0.9 m, capped so the controls stay
// visible). Before FLOOD it creeps up with danger. Translucent, with a
// gentle vertex ripple (none in reduced motion).

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, DoubleSide, type Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { useStore } from "../../store.ts";
import { PALETTE } from "../palette.ts";
import { auxOpenNow } from "./AuxRoom.tsx";
import { ev, shipLive } from "./kit.tsx";
import { AUX_CX, AUX_CZ, AUX_D, AUX_W, ROOM } from "./layout.ts";

export const WATER_MAX_M = 0.6;
/** a lost compartment: deep, but the valve handwheels (1.05 m) stay clear */
export const WATER_LOST_M = 0.9;

/** Target water height in metres from the current view. */
export function waterTarget(): number {
  const v = ev();
  if (!v) return 0;
  if (v.phase === "LOST") return 1.2;
  if (v.phase === "SURVIVED") return 0.03;
  if (v.ship.lost.ENGINE) return WATER_LOST_M;
  if (shipLive(v.phase)) return 0.03 + (Math.min(100, v.flood.engineLevel) / 100) * (WATER_MAX_M - 0.03);
  return 0.02 + (v.danger / 100) * 0.3;
}

export function Water() {
  const ref = useRef<Mesh>(null);
  const aux = useRef<Mesh>(null);
  const h = useRef(0.02);
  const lastRipple = useRef(-1);
  const flat = useRef(false);
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
    if (aux.current) {
      aux.current.position.y = h.current;
      aux.current.visible = auxOpenNow();
    }
    mat.opacity = 0.42 + Math.min(0.25, h.current * 0.5);
    // ripple at ~20 Hz (vertex rewrite + normals is the costly part); once
    // flat under reduced motion, leave the geometry alone
    const reduced = useStore.getState().reducedMotion;
    const t = performance.now() / 1000;
    if (t - lastRipple.current < 0.05 || (reduced && flat.current)) return;
    lastRipple.current = t;
    flat.current = reduced;
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
  });

  return (
    <group>
      <mesh ref={ref} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null} renderOrder={2} />
      {/* the aux room (and the doorway): flat, sharing the material */}
      <mesh ref={aux} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[AUX_CX + 0.15, 0.02, AUX_CZ]} raycast={() => null} renderOrder={2} visible={false}>
        <planeGeometry args={[AUX_W + 0.3, AUX_D]} />
      </mesh>
    </group>
  );
}
