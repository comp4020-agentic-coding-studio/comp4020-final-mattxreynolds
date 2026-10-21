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
import { Block, GEO, MAT } from "./kit.tsx";
import { fxClock, navView, nowS } from "./state.ts";

export const ROOM = { w: 10, d: 8, h: 3.2, winLo: 1.3, winHi: 2.75 } as const;
const HW = ROOM.w / 2;
const HD = ROOM.d / 2;
const T = 0.12; // wall thickness

const FOG = "#1b2a33";

// ------------------------------------------------------------ sky + sea

const skyMat = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { flash: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float flash;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, -0.2, 1.0);
      vec3 horizon = vec3(0.106, 0.165, 0.200);
      vec3 low = vec3(0.16, 0.22, 0.27);
      vec3 high = vec3(0.035, 0.05, 0.07);
      vec3 c = mix(horizon, low, smoothstep(0.0, 0.08, h));
      c = mix(c, high, smoothstep(0.08, 0.7, h));
      // ragged cloud bands
      float band = sin(vDir.x * 9.0 + vDir.z * 4.0) * sin(vDir.z * 7.0 - vDir.x * 3.0);
      c += vec3(0.03, 0.035, 0.04) * smoothstep(0.2, 0.9, band) * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.3, 0.6, h));
      c += vec3(0.55, 0.6, 0.7) * flash * smoothstep(-0.05, 0.4, h);
      gl_FragColor = vec4(c, 1.0);
    }`,
});

function Sky() {
  useFrame(() => {
    // occasional distant lightning (none under reduced motion)
    const t = nowS();
    const reduced = useStore.getState().reducedMotion;
    const cycle = t % 11.3;
    const f = reduced ? 0 : cycle < 0.08 ? 1 : cycle > 0.18 && cycle < 0.24 ? 0.6 : 0;
    skyMat.uniforms.flash.value = f * 0.35;
  });
  return (
    <mesh material={skyMat} raycast={() => null}>
      <sphereGeometry args={[74, 32, 16]} />
    </mesh>
  );
}

function Sea() {
  const ref = useRef<Mesh>(null);
  const geo = useMemo(() => {
    const g = new PlaneGeometry(150, 72, 56, 28);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: "#24505f", roughness: 0.3, metalness: 0.25, flatShading: true }),
    [],
  );
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  const last = useRef(0);
  useFrame(() => {
    const t = nowS();
    if (t - last.current < 1 / 15) return;
    last.current = t;
    const reduced = useStore.getState().reducedMotion;
    const danger = navView()?.danger ?? 20;
    const amp = 0.45 + danger / 110;
    const pos = geo.attributes.position.array as Float32Array;
    const k = reduced ? 0.25 : 1;
    for (let i = 0; i < pos.length; i += 3) {
      const x = base[i];
      const z = base[i + 2];
      pos[i + 1] =
        amp *
        (Math.sin(x * 0.18 + t * 0.9 * k) * 0.6 +
          Math.sin(z * 0.23 - t * 1.3 * k + x * 0.05) * 0.8 +
          Math.sin((x + z) * 0.5 + t * 2.1 * k) * 0.22);
    }
    geo.attributes.position.needsUpdate = true;
    // gentle rock of the sea relative to the room (the ship rolls)
    if (ref.current && !reduced) {
      ref.current.rotation.z = Math.sin(t * 0.37) * 0.025;
      ref.current.rotation.x = Math.sin(t * 0.23) * 0.012;
    }
  });
  return <mesh ref={ref} geometry={geo} material={mat} position={[0, -0.6, -40]} raycast={() => null} />;
}

// ------------------------------------------------------------ shell

function DeckTexture() {
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
        p.push([HW - 0.005, y, z]);
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

/** A side wall along Z with square holes for portholes at the given z centres. */
function WallZ({ x, ports, facing }: { x: number; ports: number[]; facing: 1 | -1 }) {
  const y0 = 1.35;
  const y1 = 2.05;
  const xc = x + (facing * -T) / 2;
  const parts: ReactElement[] = [
    <Block key="low" p={[xc, 0.45, 0]} s={[T, 0.9, ROOM.d]} m={MAT.bulkheadLow} />,
    <Block key="mid" p={[xc, (0.9 + y0) / 2, 0]} s={[T, y0 - 0.9, ROOM.d]} m={MAT.bulkhead} />,
    <Block key="top" p={[xc, (y1 + ROOM.h) / 2, 0]} s={[T, ROOM.h - y1, ROOM.d]} m={MAT.bulkhead} />,
  ];
  const half = (y1 - y0) / 2;
  const edges = [-HD, ...ports.flatMap((z) => [z - half, z + half]), HD];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    parts.push(<Block key={`p${i}`} p={[xc, (y0 + y1) / 2, (a + b) / 2]} s={[T, y1 - y0, b - a]} m={MAT.bulkhead} />);
  }
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
function CeilingLamp({ position, glow }: { position: [number, number, number]; glow: MeshBasicMaterial }) {
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

/** Room lighting level from the game state (0 dead … 1 full working light). */
function lightLevel(): { work: number; red: number; danger: number } {
  const v = navView();
  if (!v) return { work: 0.3, red: 0, danger: 0 };
  const dead = v.phase === "PROLOGUE" && !v.prologue.busOn;
  let work = dead ? 0.12 : v.phase === "PROLOGUE" ? 0.55 : v.power.online || v.phase !== "POWER" ? 1 : 0.7;
  if (v.phase === "LOST") work = 0.25;
  const red = v.phase === "PROLOGUE" && !v.prologue.acknowledged ? 1 : 0;
  return { work, red, danger: v.danger / 100 };
}

export function RoomLights() {
  const hemi = useRef<HemisphereLight>(null);
  const work = useRef<PointLight[]>([]);
  const redFill = useRef<PointLight>(null);
  const lampGlow = useMemo(() => new MeshBasicMaterial({ color: PALETTE.workLight, toneMapped: false }), []);
  const warm = useMemo(() => new Color(PALETTE.workLight), []);
  const smooth = useRef(0.3);
  useFrame((_, dt) => {
    const { work: target, red, danger } = lightLevel();
    const t = nowS();
    const reduced = useStore.getState().reducedMotion;
    smooth.current += (target - smooth.current) * Math.min(1, dt * 2.5);
    let k = smooth.current;
    // generator trip: lights brown out and stutter
    const trip = fxClock.trip === undefined ? Infinity : t - fxClock.trip;
    if (trip < 1.4) k *= reduced ? 0.5 : 0.3 + 0.5 * (Math.sin(trip * 41) > 0 ? 1 : 0.2);
    // critical flooding: a slow nervous flicker
    if (!reduced && danger > 0.75 && Math.sin(t * 13) * Math.sin(t * 3.1) > 0.92) k *= 0.6;
    for (const l of work.current) if (l) l.intensity = 8.5 * k;
    if (hemi.current) hemi.current.intensity = 0.65 + 0.7 * k;
    lampGlow.color.copy(warm).multiplyScalar(0.15 + 0.85 * k);
    if (redFill.current) {
      const pulse = red ? (reduced ? 0.8 : 0.5 + 0.5 * Math.abs(Math.sin(t * 2.2))) : 0;
      redFill.current.intensity = 2.5 * pulse + 3 * Math.max(0, danger - 0.5);
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
      <Sky />
      <Sea />
      {/* deck + ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={GEO.plane} scale={[ROOM.w, ROOM.d, 1]}>
        <meshStandardMaterial map={deck} roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]} geometry={GEO.plane} scale={[ROOM.w, ROOM.d, 1]} material={MAT.ceiling} />
      <WallX z={-HD} holes={windows} y0={ROOM.winLo} y1={ROOM.winHi} facing={-1} />
      <WallX z={HD} holes={[]} y0={ROOM.winLo} y1={ROOM.winHi} facing={1} />
      <WallZ x={-HW} ports={[-2.1]} facing={-1} />
      <WallZ x={HW} ports={[2.6]} facing={1} />
      <Rivets />
      <Pipes />
      {/* skirting kick plates */}
      <Block p={[0, 0.06, -HD + 0.14]} s={[ROOM.w, 0.12, 0.04]} m={MAT.bulkheadDark} />
      <Block p={[0, 0.06, HD - 0.14]} s={[ROOM.w, 0.12, 0.04]} m={MAT.bulkheadDark} />
    </group>
  );
}
