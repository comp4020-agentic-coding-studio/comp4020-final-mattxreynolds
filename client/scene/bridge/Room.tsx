// The Bridge shell: deck, bulkheads with forward windows and portholes,
// ceiling pipes, the stormy sea and sky outside, fog, and the room lights
// (which follow the prologue/power state and danger).

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import {
  BackSide,
  Color,
  type Group,
  type HemisphereLight,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type PointLight,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  MeshBasicMaterial,
} from "three";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { MODE_RULES } from "../../../shared/config.ts";
import { SHIP_PHASES } from "../../../shared/protocol.ts";
import { Block, GEO, MAT } from "./kit.tsx";
import { fxClock, navView, nowS } from "./state.ts";
import { Exterior } from "./Exterior.tsx";
import { storm } from "./storm.ts";

export const ROOM = { w: 10, d: 8, h: 3.2, winLo: 1.3, winHi: 2.75 } as const;
/** The Comms Room doorway in the starboard bulkhead (x = +5): z range. */
export const COMMS_DOOR: [number, number] = [0, 1.2];
const HW = ROOM.w / 2;
const HD = ROOM.d / 2;
const T = 0.12; // wall thickness

const FOG = "#1b2a33";

// ------------------------------------------------------------ shell

export function DeckTexture() {
  return useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.deck;
      ctx.fillRect(0, 0, w, h);
      // diamond tread plate
      ctx.fillStyle = PALETTE.deckPlate;
      for (let y = 0; y < h; y += 32) {
        for (let x = 0; x < w; x += 32) {
          const off = (y / 32) % 2 ? 16 : 0;
          ctx.save();
          ctx.translate(x + off + 8, y + 16);
          ctx.rotate((y / 32) % 2 ? 0.6 : -0.6);
          ctx.fillRect(-9, -2.5, 18, 5);
          ctx.restore();
        }
      }
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, w, h);
    },
    [],
  );
}

/** Porthole cover: wall colour with a transparent circle (alphaTest). */
function usePortholeTexture() {
  return useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.bulkhead;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    },
    [],
  );
}

// unlit: at 8 % opacity a lit glass layer over the sky + sea was a third full
// lighting pass across the forward windows for no visible difference
const glassMat = new MeshBasicMaterial({ color: "#8fb3c4", transparent: true, opacity: 0.08, depthWrite: false });
const rivetMat = new MeshStandardMaterial({ color: PALETTE.bulkheadDark, roughness: 0.5, metalness: 0.5 });
// a 6-sided dome is plenty at rivet size (hundreds of instances)
const rivetGeo = new SphereGeometry(1, 6, 3);

/** Rows of rivets along the bulkhead bands (one instanced mesh). */
function Rivets() {
  const ref = useRef<InstancedMesh>(null);
  const points = useMemo(() => {
    const p: [number, number, number][] = [];
    for (const y of [0.92, 3.05]) {
      for (let x = -HW + 0.2; x < HW; x += 0.4) {
        p.push([x, y, -HD + 0.005]);
        p.push([x, y, HD - 0.005]);
      }
      for (let z = -HD + 0.2; z < HD; z += 0.4) {
        p.push([-HW + 0.005, y, z]);
        // none floating in the Comms doorway
        if (y > 2.5 || z < COMMS_DOOR[0] - 0.05 || z > COMMS_DOOR[1] + 0.05) p.push([HW - 0.005, y, z]);
      }
    }
    return p;
  }, []);
  useEffect(() => {
    const m = new Matrix4();
    points.forEach((pt, i) => {
      m.makeScale(0.018, 0.018, 0.018).setPosition(...pt);
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [points]);
  return <instancedMesh ref={ref} args={[rivetGeo, rivetMat, points.length]} />;
}

function Porthole({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const tex = usePortholeTexture();
  const s = 0.7;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh geometry={GEO.plane} scale={[s, s, 1]} position={[0, 0, 0.065]}>
        <meshStandardMaterial map={tex} alphaTest={0.5} roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <torusGeometry args={[s * 0.46, 0.035, 10, 32]} />
        <primitive object={MAT.brass} attach="material" />
      </mesh>
      <mesh geometry={GEO.plane} material={glassMat} scale={[s, s, 1]} position={[0, 0, 0.0]} />
    </group>
  );
}

/** A wall along X (front/aft) with optional window openings [x0, x1] between y0..y1. */
function WallX({ z, holes, y0, y1, facing }: { z: number; holes: [number, number][]; y0: number; y1: number; facing: 1 | -1 }) {
  const parts: ReactElement[] = [];
  const zc = z + (facing * -T) / 2;
  // lower band + mid + upper
  parts.push(<Block key="low" p={[0, 0.45, zc]} s={[ROOM.w, 0.9, T]} m={MAT.bulkheadLow} />);
  parts.push(<Block key="mid" p={[0, (0.9 + y0) / 2, zc]} s={[ROOM.w, y0 - 0.9, T]} m={MAT.bulkhead} />);
  parts.push(<Block key="top" p={[0, (y1 + ROOM.h) / 2, zc]} s={[ROOM.w, ROOM.h - y1, T]} m={MAT.bulkhead} />);
  // piers between holes
  const edges = [-HW, ...holes.flat(), HW];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    if (b - a > 0.001) parts.push(<Block key={`p${i}`} p={[(a + b) / 2, (y0 + y1) / 2, zc]} s={[b - a, y1 - y0, T]} m={MAT.bulkhead} />);
  }
  holes.forEach(([a, b], i) => {
    const cx = (a + b) / 2;
    const w = b - a;
    parts.push(
      <group key={`w${i}`}>
        <Block p={[cx, y0 - 0.03, z - facing * 0.02]} s={[w + 0.1, 0.08, 0.28]} m={MAT.brassDark} />
        <Block p={[cx, y1 + 0.03, zc]} s={[w + 0.1, 0.06, T + 0.06]} m={MAT.bulkheadDark} />
        <Block p={[a - 0.02, (y0 + y1) / 2, zc]} s={[0.06, y1 - y0, T + 0.06]} m={MAT.bulkheadDark} />
        <Block p={[b + 0.02, (y0 + y1) / 2, zc]} s={[0.06, y1 - y0, T + 0.06]} m={MAT.bulkheadDark} />
        <Block p={[cx, (y0 + y1) / 2, zc]} s={[0.035, y1 - y0, 0.04]} m={MAT.bulkheadDark} />
        <mesh geometry={GEO.plane} material={glassMat} position={[cx, (y0 + y1) / 2, zc]} scale={[w, y1 - y0, 1]} />
      </group>,
    );
  });
  return <group>{parts}</group>;
}

/** Door height in side walls (the porthole band's top, so the lintel is the top band). */
export const DOOR_H = 2.05;

/** A side wall along Z (spanning `span`) with square holes for portholes at
 * the given z centres and an optional full-height doorway [z0, z1]. */
export function WallZ({ x, ports, facing, span = [-HD, HD], door }: { x: number; ports: number[]; facing: 1 | -1; span?: [number, number]; door?: [number, number] }) {
  const y0 = 1.35;
  const y1 = DOOR_H;
  const xc = x + (facing * -T) / 2;
  // a band from z=a..b, split around the doorway
  const band = (key: string, y: number, h: number, m: MeshStandardMaterial, a = span[0], b = span[1]) => {
    const segs: [number, number][] = door ? [[a, Math.min(b, door[0])], [Math.max(a, door[1]), b]] : [[a, b]];
    return segs
      .filter(([s0, s1]) => s1 - s0 > 0.001)
      .map(([s0, s1], i) => <Block key={`${key}${i}`} p={[xc, y, (s0 + s1) / 2]} s={[T, h, s1 - s0]} m={m} />);
  };
  const parts: ReactElement[] = [
    ...band("low", 0.45, 0.9, MAT.bulkheadLow),
    ...band("mid", (0.9 + y0) / 2, y0 - 0.9, MAT.bulkhead),
    <Block key="top" p={[xc, (y1 + ROOM.h) / 2, (span[0] + span[1]) / 2]} s={[T, ROOM.h - y1, span[1] - span[0]]} m={MAT.bulkhead} />,
  ];
  const half = (y1 - y0) / 2;
  const edges = [span[0], ...ports.flatMap((z) => [z - half, z + half]), span[1]];
  for (let i = 0; i < edges.length; i += 2) parts.push(...band(`p${i}`, (y0 + y1) / 2, y1 - y0, MAT.bulkhead, edges[i], edges[i + 1]));
  ports.forEach((z, i) =>
    parts.push(<Porthole key={`h${i}`} position={[xc, (y0 + y1) / 2, z]} rotationY={facing > 0 ? -Math.PI / 2 : Math.PI / 2} />),
  );
  return <group>{parts}</group>;
}

function Pipes() {
  return (
    <group>
      {[-0.9, -0.65].map((dx, i) => (
        <mesh key={i} geometry={GEO.cyl12} material={i ? MAT.pipe : MAT.brassDark} position={[HW - 0.35 + dx * 0.2, ROOM.h - 0.18 - i * 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.05, ROOM.d, 0.05]} />
      ))}
      <mesh geometry={GEO.cyl12} material={MAT.pipe} position={[0, ROOM.h - 0.15, HD - 0.3]} rotation={[0, 0, Math.PI / 2]} scale={[0.06, ROOM.w, 0.06]} />
      <mesh geometry={GEO.cyl12} material={MAT.pipe} position={[-HW + 0.3, ROOM.h - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.045, ROOM.d, 0.045]} />
      {/* ceiling beams */}
      {[-2.6, 0, 2.6].map((z) => (
        <Block key={z} p={[0, ROOM.h - 0.06, z]} s={[ROOM.w, 0.12, 0.18]} m={MAT.bulkheadDark} />
      ))}
    </group>
  );
}

/** Caged ceiling lamp fixture whose glow follows the room lighting level. */
export function CeilingLamp({ position, glow }: { position: [number, number, number]; glow: MeshBasicMaterial }) {
  return (
    <group position={position}>
      <mesh geometry={GEO.cyl} material={MAT.brassDark} position={[0, 0.06, 0]} scale={[0.14, 0.04, 0.14]} />
      <mesh geometry={GEO.sphere} material={glow} scale={[0.1, 0.07, 0.1]} />
      <mesh position={[0, -0.01, 0]}>
        <torusGeometry args={[0.11, 0.008, 6, 20]} />
        <primitive object={MAT.brassDark} attach="material" />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ lighting

/** Room lighting level from the game state (0 dead … 1 full working light).
 * `emergency`: the generator has tripped and the Bridge runs on its own
 * battery — dim working light plus a steady red emergency fill. */
export function lightLevel(): { work: number; red: number; danger: number; emergency: number } {
  const v = navView();
  if (!v) return { work: 0.3, red: 0, danger: 0, emergency: 0 };
  const dead = v.phase === "PROLOGUE" && !v.prologue.busOn;
  let work = dead ? 0.12 : v.phase === "PROLOGUE" ? 0.55 : v.power.online || v.phase !== "POWER" ? 1 : 0.7;
  if (v.phase === "LOST") work = 0.25;
  // Blackout / All Systems: the rooms run on emergency lamps throughout
  if (MODE_RULES[v.mode]?.dark && v.phase !== "PROLOGUE") work *= 0.6;
  const emergency = v.ship.gridDown && SHIP_PHASES.includes(v.phase) ? 1 : 0;
  if (emergency) work *= 0.45;
  const red = v.phase === "PROLOGUE" && !v.prologue.acknowledged ? 1 : 0;
  return { work, red, danger: v.danger / 100, emergency };
}

export function RoomLights() {
  const hemi = useRef<HemisphereLight>(null);
  const work = useRef<PointLight[]>([]);
  const redFill = useRef<PointLight>(null);
  const lampGlow = useMemo(() => new MeshBasicMaterial({ color: PALETTE.workLight, toneMapped: false }), []);
  const warm = useMemo(() => new Color(PALETTE.workLight), []);
  const smooth = useRef(0.3);
  useFrame((_, dt) => {
    const { work: target, red, danger, emergency } = lightLevel();
    const t = nowS();
    const reduced = useStore.getState().reducedMotion;
    smooth.current += (target - smooth.current) * Math.min(1, dt * 2.5);
    let k = smooth.current;
    // generator trip: lights brown out and stutter
    const trip = Math.min(fxClock.trip === undefined ? Infinity : t - fxClock.trip, fxClock.gridTrip === undefined ? Infinity : t - fxClock.gridTrip);
    if (trip < 1.4) k *= reduced ? 0.5 : 0.3 + 0.5 * (Math.sin(trip * 41) > 0 ? 1 : 0.2);
    // critical flooding: a slow nervous flicker
    if (!reduced && danger > 0.75 && Math.sin(t * 13) * Math.sin(t * 3.1) > 0.92) k *= 0.6;
    for (const l of work.current) if (l) l.intensity = 8.5 * k;
    if (hemi.current) hemi.current.intensity = 0.65 + 0.7 * k + storm.flash * 1.6;
    lampGlow.color.copy(warm).multiplyScalar(0.15 + 0.85 * k);
    if (redFill.current) {
      const pulse = red ? (reduced ? 0.8 : 0.5 + 0.5 * Math.abs(Math.sin(t * 2.2))) : 0;
      redFill.current.intensity = 2.5 * pulse + 3 * Math.max(0, danger - 0.5) + 1.6 * emergency;
    }
  });
  const lamps: [number, number, number][] = [
    [-1.6, ROOM.h - 0.2, -1.4],
    [1.6, ROOM.h - 0.2, 1.4],
  ];
  return (
    <group>
      <fog attach="fog" args={[FOG, 12, 72]} />
      <color attach="background" args={[FOG]} />
      <hemisphereLight ref={hemi} args={["#c9d6e0", "#3a3028", 0.9]} />
      {lamps.map((p, i) => (
        <group key={i}>
          <pointLight ref={(l) => void (work.current[i] = l!)} position={[p[0], p[1] - 0.15, p[2]]} color={PALETTE.workLight} intensity={4} distance={13} decay={1.4} />
          <CeilingLamp position={p} glow={lampGlow} />
        </group>
      ))}
      <pointLight ref={redFill} position={[0, 2.6, -1]} color={PALETTE.emergencyRed} intensity={0} distance={12} decay={1.4} />
    </group>
  );
}

// ------------------------------------------------------------ alarm beacon

/** Rotating red alarm beacon; sweeps until the alarm is acknowledged. The room
 * light itself pulses red (RoomLights); no real spotlight, for cost. */
export function AlarmBeacon({ position }: { position: [number, number, number] }) {
  const spin = useRef<Group>(null);
  const dome = useMemo(() => new MeshStandardMaterial({ color: "#5a1410", emissive: PALETTE.emergencyRed, emissiveIntensity: 0, transparent: true, opacity: 0.75, depthWrite: false }), []);
  useEffect(() => () => dome.dispose(), [dome]);
  useFrame((_, dt) => {
    const v = navView();
    const active = !!v && v.phase === "PROLOGUE" && !v.prologue.acknowledged;
    const reduced = useStore.getState().reducedMotion;
    if (spin.current && active && !reduced) spin.current.rotation.y += dt * 4;
    dome.emissiveIntensity = active ? (reduced ? 1.6 : 1.2 + 0.8 * Math.abs(Math.sin(nowS() * 4))) : 0.05;
  });
  return (
    <group position={position}>
      <mesh geometry={GEO.cyl} material={MAT.enamel} position={[0, -0.04, 0]} scale={[0.1, 0.06, 0.1]} />
      <mesh geometry={GEO.sphere} material={dome} position={[0, 0.06, 0]} scale={[0.085, 0.12, 0.085]} />
      <group ref={spin} position={[0, 0.06, 0]}>
        <mesh geometry={GEO.box} material={MAT.chrome} position={[0, 0, 0.035]} scale={[0.07, 0.09, 0.012]} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ the room

export function RoomShell() {
  const deck = DeckTexture();
  deck.wrapS = deck.wrapT = RepeatWrapping;
  deck.repeat.set(ROOM.w / 1.2, ROOM.d / 1.2);
  const windows: [number, number][] = [
    [-4.3, -1.6],
    [-1.25, 1.25],
    [1.6, 4.3],
  ];
  return (
    <group>
      <Exterior />
      {/* deck + ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={GEO.plane} scale={[ROOM.w, ROOM.d, 1]}>
        <meshStandardMaterial map={deck} roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]} geometry={GEO.plane} scale={[ROOM.w, ROOM.d, 1]} material={MAT.ceiling} />
      <WallX z={-HD} holes={windows} y0={ROOM.winLo} y1={ROOM.winHi} facing={-1} />
      <WallX z={HD} holes={[]} y0={ROOM.winLo} y1={ROOM.winHi} facing={1} />
      <WallZ x={-HW} ports={[-2.1]} facing={-1} />
      {/* starboard: the Comms Room doorway (BRIDGE_LAYOUT's door) */}
      <WallZ x={HW} ports={[]} facing={1} door={COMMS_DOOR} />
      <Rivets />
      <Pipes />
      {/* skirting kick plates */}
      <Block p={[0, 0.06, -HD + 0.14]} s={[ROOM.w, 0.12, 0.04]} m={MAT.bulkheadDark} />
      <Block p={[0, 0.06, HD - 0.14]} s={[ROOM.w, 0.12, 0.04]} m={MAT.bulkheadDark} />
    </group>
  );
}
