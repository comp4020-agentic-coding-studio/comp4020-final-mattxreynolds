// Engine Room lighting, background and fog, by phase:
//  - PROLOGUE (bus off): dim, rotating red beacon, strobing alarm lamp;
//    the EMERGENCY BUS panel has its own spot so it is never lost.
//  - bus on, before POWER is online: dim emergency fittings (cool, low).
//  - POWER online (or later): warm working light, beacon off.
//  - LIGHTS circuit shed by the Bridge, or the grid tripped: working
//    fittings dark, red emergency lamps on the bulkheads only (the controls
//    carry emissive labels, so the room stays playable).
// Flicker and red tint scale with danger; trip dips the lights, power-up
// flashes them. Everything is driven in useFrame from the store.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AmbientLight, Color, Fog, Group, HemisphereLight, MeshBasicMaterial, MeshStandardMaterial, Object3D, PointLight, SpotLight } from "three";
import { useStore } from "../../store.ts";
import { PALETTE } from "../palette.ts";
import { kicks } from "./Effects.tsx";
import { AT } from "./layout.ts";
import { ev, G, M, stageOf, STAGE } from "./kit.tsx";

const WARM = new Color(PALETTE.workLight);
const COOL = new Color("#9fb4c4");
const RED = new Color(PALETTE.emergencyRed);
const BG_DARK = new Color("#0b0e10");
const BG_WARM = new Color("#1c1d1b");

/** Emergency lamp positions [x, y, z, rotY] on the walls (facing into the room). */
const EMERGENCY_LAMPS: [number, number, number, number][] = [
  [-2.2, 2.45, -3.98, 0],
  [1.9, 2.45, -3.98, 0],
  [-2.6, 2.45, 3.98, Math.PI],
  [2.0, 2.45, 3.98, Math.PI],
  [4.98, 2.45, 3.1, -Math.PI / 2],
  [-4.98, 2.45, -2.6, Math.PI / 2],
];

export function Lighting() {
  const hemi = useRef<HemisphereLight>(null);
  const amb = useRef<AmbientLight>(null);
  const work = useRef<(PointLight | null)[]>([]);
  const beaconLight = useRef<SpotLight>(null);
  const beaconTarget = useMemo(() => new Object3D(), []);
  const beaconHead = useRef<Group>(null);
  const busSpot = useRef<SpotLight>(null);
  const busTarget = useMemo(() => new Object3D(), []);
  const strobe = useRef<PointLight>(null);
  const fog = useMemo(() => new Fog("#0b0e10", 6, 18), []);
  const bg = useMemo(() => new Color("#0b0e10"), []);
  const lit = useRef(0); // eased 0 = dark, 0.35 = emergency, 1 = working
  const emerg = useRef(0); // eased 0..1: lighting circuit shed, red lamps on
  const emergMat = useMemo(() => new MeshStandardMaterial({ color: "#3a1a14", emissive: "#ff2a1a", emissiveIntensity: 0, roughness: 0.3 }), []);
  const tmp = useMemo(() => new Color(), []);
  const lensMat = useMemo(() => new MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.9 }), []);
  const fixtureMat = useMemo(() => new MeshBasicMaterial({ color: "#fff3d6" }), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const v = ev();
    const stage = stageOf(v);
    const busOn = v?.prologue.busOn ?? false;
    const online = (v?.power.online ?? false) || stage > STAGE.POWER;
    const alarm = stage <= STAGE.PROLOGUE && !(v?.prologue.acknowledged ?? false);
    const danger = v?.danger ?? 0;
    const lost = v?.phase === "LOST";
    const t = performance.now() / 1000;
    const reduced = useStore.getState().reducedMotion;

    // engine-room lighting circuit (from the grid): shed, or the grid is down
    const shed = online && !!v && (!v.ship.circuits.LIGHTS || v.ship.gridDown);
    const target = lost ? 0.15 : shed ? 0.3 : online ? 1 : busOn ? 0.42 : 0.18;
    emerg.current += ((shed || lost ? 1 : 0) - emerg.current) * Math.min(1, dt * 4);
    lit.current += (target - lit.current) * Math.min(1, dt * (target > lit.current ? 1.6 : 3));

    // decay one-shot kicks
    kicks.dip = Math.max(0, kicks.dip - dt * 0.6);
    kicks.flash = Math.max(0, kicks.flash - dt * 0.8);
    kicks.arc = Math.max(0, kicks.arc - dt * 4);
    kicks.contact = Math.max(0, kicks.contact - dt);

    // danger flicker: rare dropouts that become frequent past ~50
    let flicker = 1;
    if (!reduced && danger > 25) {
      const rate = (danger - 25) / 75;
      const n = Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.7) * Math.sin(t * 2.9);
      if (n > 1 - rate * 0.5) flicker = 0.55;
    }
    const dip = 1 - kicks.dip * 0.75;
    const L = lit.current * flicker * dip + kicks.flash * 0.6 + kicks.arc * 0.5;
    const redTint = Math.min(0.45, (danger / 100) * 0.4) + (online ? 0 : 0.25) + emerg.current * 0.45;

    tmp.copy(lit.current > 0.6 ? WARM : COOL).lerp(RED, redTint);
    if (hemi.current) {
      hemi.current.intensity = 0.6 + L * 0.95;
      hemi.current.color.copy(tmp);
    }
    if (amb.current) amb.current.intensity = 0.18 + L * 0.25;
    // shed: the working fittings go dark; two of their lights stand in as
    // dim red emergency lamps (no extra lights in the scene)
    work.current.forEach((w, i) => {
      if (!w) return;
      const e = emerg.current;
      w.intensity = L * 9 * (1 - e) + e * (i < 2 || i === 3 ? 3.2 : 0) * flicker * dip;
      w.color.copy(tmp).lerp(RED, e * 0.8);
    });
    const F = L * (1 - emerg.current * 0.9);
    fixtureMat.color.setRGB(0.25 + F * 0.9, 0.24 + F * 0.85, 0.2 + F * 0.7);
    emergMat.emissiveIntensity = emerg.current * (reduced ? 2 : 1.6 + Math.sin(t * 2.2) * 0.4);

    // rotating beacon (alarm) — stops when the bridge acknowledges
    const beaconOn = alarm || lost;
    if (beaconHead.current) beaconHead.current.rotation.y = beaconOn ? t * (reduced ? 1.2 : 4) : beaconHead.current.rotation.y;
    if (beaconLight.current) {
      beaconLight.current.intensity = beaconOn ? 30 : 0;
      const a = beaconHead.current?.rotation.y ?? 0;
      beaconTarget.position.set(AT.beacon[0] + Math.sin(a) * 3, 0.6, AT.beacon[2] + Math.cos(a) * 3);
      beaconTarget.updateMatrixWorld();
    }
    lensMat.opacity = beaconOn ? 0.95 : 0.5;
    lensMat.color.set(beaconOn ? "#ff3020" : "#5a1a14");

    // strobing alarm lamp (no strobe in reduced motion: steady glow instead)
    if (strobe.current) {
      strobe.current.intensity = beaconOn ? (reduced ? 2.5 : Math.sin(t * Math.PI * 2 * 1.2) > 0.4 ? 6 : 0) : 0;
    }

    // the bus panel is self-lit until the bus is on, then fades to a small accent
    if (busSpot.current) {
      const want = busOn ? 1.5 : 9 + Math.sin(t * 3) * 1.5;
      busSpot.current.intensity += (want - busSpot.current.intensity) * Math.min(1, dt * 3);
    }

    bg.copy(BG_DARK).lerp(BG_WARM, lit.current);
    fog.color.copy(bg);
    fog.far = 14 + lit.current * 10;
    (state.scene as { background: unknown }).background = bg;
    state.scene.fog = fog;
  });

  return (
    <group>
      <hemisphereLight ref={hemi} args={["#c9d6e0", "#2a2420", 0.6]} />
      <ambientLight ref={amb} intensity={0.2} />
      {/* working light fittings along the ceiling */}
      {([[-2.6, -1.6], [0.6, -1.6], [3.4, -1.2], [-2.0, 2.0], [1.6, 2.0]] as const).map(([x, z], i) => (
        <group key={i} position={[x, 2.9, z]}>
          <mesh geometry={G().box} material={M().steel} scale={[0.7, 0.08, 0.2]} />
          <mesh geometry={G().box} material={fixtureMat} scale={[0.6, 0.03, 0.12]} position={[0, -0.05, 0]} />
          <pointLight
            ref={(l) => {
              work.current[i] = l;
            }}
            position={[0, -0.25, 0]}
            intensity={0}
            distance={7}
            decay={1.6}
          />
        </group>
      ))}
      {/* emergency lamps on the bulkheads: caged red domes, lit when the
          lighting circuit is shed (paired with the "EMERGENCY LIGHTING" stencil) */}
      {EMERGENCY_LAMPS.map(([x, y, z, ry], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, ry, 0]}>
          <mesh geometry={G().box} material={M().steel} scale={[0.22, 0.14, 0.06]} position={[0, 0, 0.03]} />
          <mesh geometry={G().sphere} material={emergMat} scale={[0.14, 0.1, 0.09]} position={[0, 0, 0.07]} />
        </group>
      ))}
      {/* rotating red beacon */}
      <group position={AT.beacon}>
        <mesh geometry={G().cyl} material={M().steel} scale={[0.22, 0.1, 0.22]} position={[0, 0.07, 0]} />
        <mesh geometry={G().sphere} material={lensMat} scale={[0.2, 0.22, 0.2]} position={[0, -0.05, 0]} />
        <group ref={beaconHead}>
          <mesh geometry={G().box} material={fixtureMat} scale={[0.04, 0.12, 0.14]} position={[0, -0.05, 0.05]} />
        </group>
        <spotLight ref={beaconLight} color="#ff2a1a" angle={0.55} penumbra={0.5} distance={9} decay={1.4} target={beaconTarget} intensity={0} />
        <pointLight ref={strobe} color="#ff3a20" distance={6} decay={1.5} position={[0, -0.2, 0]} intensity={0} />
      </group>
      <primitive object={beaconTarget} />
      {/* bus panel key light */}
      <spotLight
        ref={busSpot}
        position={[AT.busPanel[0], 2.8, AT.busPanel[2] + 1.6]}
        color="#ffd27a"
        angle={0.42}
        penumbra={0.6}
        distance={6}
        decay={1.2}
        target={busTarget}
        intensity={8}
      />
      <primitive object={busTarget} position={[AT.busPanel[0], 1.2, AT.busPanel[2]]} />
    </group>
  );
}
