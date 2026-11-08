// Bridge dressing: everything here is a prop, not a control. Where something
// could look usable (helm, telegraph) a plate says it is locked (invariant 9).
// Repeats (screws, spokes, cables, rungs) are instanced.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { Instanced, type Item } from "./inst.tsx";
import { Block, GEO, MAT, Plate } from "./kit.tsx";
import { nowS } from "./state.ts";

const std = (color: string, roughness = 0.6, metalness = 0.3) => new MeshStandardMaterial({ color, roughness, metalness });
export const DM = {
  trim: std("#4a3220", 0.55, 0.05),
  worn: std("#8d948b", 0.5, 0.6),
  cable: std("#101213", 0.8, 0.1),
  cableRed: std("#5a1c18", 0.8, 0.1),
  locker: std("#3a4a52", 0.55, 0.45),
  red: std("#a82a22", 0.5, 0.2),
  vent: std("#07090a", 0.9, 0.2),
  canvas: std("#d9d0b8", 0.9, 0),
  seat: std("#3b2a22", 0.8, 0.05),
  glass: new MeshStandardMaterial({ color: "#9fc4d4", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
  glowAmber: new MeshBasicMaterial({ color: "#ffb52e", toneMapped: false }),
  glowGreen: new MeshBasicMaterial({ color: "#39d36b", toneMapped: false }),
  hazard: std("#d9ad1c", 0.6, 0.2),
};
// emissive > 1.5 -> glows under bloom
DM.glowAmber.color.multiplyScalar(2);
DM.glowGreen.color.multiplyScalar(1.8);

const HW = 5;
const HD = 4;

// ------------------------------------------------------------ small helpers

function Cyl({ p, s, m, r }: { p: [number, number, number]; s: [number, number, number]; m: MeshStandardMaterial; r?: [number, number, number] }) {
  return <mesh geometry={GEO.cyl12} material={m} position={p} scale={s} rotation={r} />;
}

function Dial({ position, size = 0.14, label }: { position: [number, number, number]; size?: number; label: string }) {
  const map = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.dialFace;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.dialInk;
      ctx.lineWidth = 5;
      for (let i = 0; i <= 20; i++) {
        const a = (-0.8 + (i / 20) * 1.6) * Math.PI - Math.PI / 2;
        const r0 = i % 5 ? 96 : 84;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
        ctx.lineTo(w / 2 + Math.cos(a) * 108, h / 2 + Math.sin(a) * 108);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.dialInk;
      ctx.font = "bold 30px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, w / 2, h * 0.72);
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + 70, h / 2 - 40);
      ctx.lineWidth = 7;
      ctx.stroke();
    },
    [label],
  );
  return (
    <group position={position}>
      <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[size * 0.62, 0.03, size * 0.62]} />
      <mesh geometry={GEO.plane} position={[0, 0, 0.017]} scale={[size, size, 1]}>
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ helm, telegraph, binnacle

/** A ship's wheel on a pedestal. Locked prop: the plate says so. */
function Helm({ position }: { position: [number, number, number] }) {
  const wheel = useRef<Group>(null);
  const spokes = useMemo<Item[]>(() => Array.from({ length: 8 }, (_, i) => ({ p: [0, 0, 0], s: [0.012, 0.52, 0.012], r: [0, 0, (i * Math.PI) / 8] })), []);
  const handles = useMemo<Item[]>(
    () => Array.from({ length: 8 }, (_, i) => ({ p: [Math.cos((i * Math.PI) / 4) * 0.31, Math.sin((i * Math.PI) / 4) * 0.31, 0], s: [0.02, 0.1, 0.02], r: [0, 0, (i * Math.PI) / 4 - Math.PI / 2] })),
    [],
  );
  useFrame(() => {
    // the wheel creeps with the autopilot (still under reduced motion)
    if (wheel.current && !useStore.getState().reducedMotion) wheel.current.rotation.z = Math.sin(nowS() * 0.2) * 0.12;
  });
  return (
    <group position={position}>
      <Block p={[0, 0.45, 0]} s={[0.5, 0.9, 0.4]} m={MAT.console} />
      <Block p={[0, 0.92, 0]} s={[0.56, 0.05, 0.46]} m={MAT.brassDark} />
      <Block p={[0, 1.0, 0.1]} s={[0.4, 0.14, 0.06]} m={MAT.consoleDark} r={[-0.4, 0, 0]} />
      <Dial position={[0, 1.05, 0.14]} size={0.1} label="RUDDER" />
      <Plate text={"HELM · AUTOPILOT\nLOCKED"} width={0.4} height={0.14} position={[0, 0.7, 0.205]} border={PALETTE.brassDark} fg={PALETTE.lampAmber} />
      <group position={[0, 1.34, -0.02]}>
        <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]} scale={[0.05, 0.3, 0.05]} />
        <group ref={wheel}>
          <mesh material={MAT.wood}>
            <torusGeometry args={[0.27, 0.022, 8, 28]} />
          </mesh>
          <Instanced geo={GEO.box} mat={MAT.wood} items={spokes} />
          <Instanced geo={GEO.box} mat={MAT.wood} items={handles} />
          <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.055, 0.06, 0.055]} />
        </group>
      </group>
    </group>
  );
}

function Telegraph({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl p={[0, 0.5, 0]} s={[0.1, 1.0, 0.1]} m={MAT.pipe} />
      <Cyl p={[0, 0.03, 0]} s={[0.2, 0.06, 0.2]} m={MAT.brassDark} />
      <group position={[0, 1.08, 0]} rotation={[-0.25, 0, 0]}>
        <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 0.12, 0.17]} />
        <mesh geometry={GEO.plane} position={[0, 0, 0.065]} scale={[0.3, 0.3, 1]}>
          <meshBasicMaterial map={useTelegraphFace()} toneMapped={false} />
        </mesh>
        <Block p={[0.03, 0.08, 0.09]} s={[0.025, 0.2, 0.02]} m={MAT.enamel} r={[0, 0, -0.7]} />
        <mesh geometry={GEO.sphere} material={DM.red} position={[0.12, 0.17, 0.09]} scale={0.03} />
      </group>
      <Plate text="ENGINE ORDERS · LOCKED" width={0.4} height={0.07} position={[0, 0.7, 0.108]} border={PALETTE.brassDark} fg={PALETTE.lampAmber} />
    </group>
  );
}
function useTelegraphFace() {
  return useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#14181a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.dialFace;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = ["FULL", "HALF", "STOP", "HALF", "FULL"];
      ctx.font = "bold 25px ui-monospace, monospace";
      lines.forEach((l, i) => {
        const a = ((i - 2) / 2) * 1.75 - Math.PI / 2;
        ctx.save();
        ctx.translate(w / 2 + Math.cos(a) * 100, h / 2 + Math.sin(a) * 100);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(l, 0, 0);
        ctx.restore();
      });
      ctx.font = "bold 26px ui-monospace, monospace";
      ctx.fillText("AHEAD", w / 2, h * 0.6);
      ctx.fillText("ASTERN", w / 2, h * 0.78);
    },
    [],
  );
}

function Binnacle({ position }: { position: [number, number, number] }) {
  const card = useCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#e9e1c8";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1b1b1b";
      ctx.font = "bold 22px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", w / 2, 18);
      ctx.fillText("S", w / 2, h - 18);
      ctx.fillText("E", w - 16, h / 2);
      ctx.fillText("W", 16, h / 2);
      ctx.fillStyle = "#a82a22";
      ctx.beginPath();
      ctx.moveTo(w / 2, 30);
      ctx.lineTo(w / 2 + 9, h / 2);
      ctx.lineTo(w / 2 - 9, h / 2);
      ctx.fill();
    },
    [],
  );
  return (
    <group position={position}>
      <Cyl p={[0, 0.35, 0]} s={[0.17, 0.7, 0.17]} m={MAT.wood} />
      <Cyl p={[0, 0.02, 0]} s={[0.22, 0.04, 0.22]} m={MAT.brassDark} />
      <Cyl p={[0, 0.72, 0]} s={[0.2, 0.05, 0.2]} m={MAT.brass} />
      <mesh geometry={GEO.cyl} material={MAT.brassDark} position={[0, 0.82, 0]} scale={[0.17, 0.16, 0.17]} />
      <mesh geometry={GEO.plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.9, 0]} scale={[0.28, 0.28, 1]}>
        <meshBasicMaterial map={card} toneMapped={false} />
      </mesh>
      <mesh geometry={GEO.sphere} material={DM.glass} position={[0, 0.9, 0]} scale={[0.17, 0.1, 0.17]} />
      {/* the two correcting spheres */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.sphere} material={MAT.chrome} position={[s * 0.26, 0.78, 0]} scale={0.07} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------ chart-room counter

function Counter({ position }: { position: [number, number, number] }) {
  const baro = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.dialFace;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.dialInk;
      ctx.font = "bold 24px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("BAROMETER", w / 2, h * 0.34);
      ctx.fillText("STORM", w * 0.3, h * 0.76);
      ctx.fillText("FAIR", w * 0.7, h * 0.76);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 - 62, h / 2 + 22);
      ctx.stroke();
    },
    [],
  );
  const log = useCanvasTexture(
    256,
    192,
    (ctx, w, h) => {
      ctx.fillStyle = "#e6dfc9";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#222";
      ctx.font = "bold 18px ui-monospace, monospace";
      ctx.fillText("LOG · WATCH", 14, 28);
      ctx.strokeStyle = "#7a766a";
      for (let y = 44; y < h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
      }
    },
    [],
  );
  return (
    <group position={position}>
      <Block p={[0, 0.45, 0]} s={[1.6, 0.9, 0.45]} m={MAT.console} />
      <Block p={[0, 0.915, 0]} s={[1.66, 0.04, 0.5]} m={MAT.wood} />
      <Block p={[0, 0.45, -0.226]} s={[1.5, 0.7, 0.01]} m={MAT.consoleDark} />
      {[-0.5, 0, 0.5].map((x) => (
        <Block key={x} p={[x, 0.6, -0.232]} s={[0.12, 0.02, 0.02]} m={MAT.brass} />
      ))}
      {/* logbook, open */}
      <mesh geometry={GEO.plane} rotation={[-Math.PI / 2, 0, 0.2]} position={[-0.5, 0.94, 0.0]} scale={[0.32, 0.24, 1]}>
        <meshStandardMaterial map={log} roughness={0.9} />
      </mesh>
      {/* VHF handset in its cradle */}
      <Block p={[0.1, 0.96, 0.08]} s={[0.1, 0.04, 0.07]} m={MAT.enamel} />
      <Block p={[0.1, 1.07, 0.1]} s={[0.045, 0.2, 0.04]} m={MAT.enamel} r={[0.15, 0, 0]} />
      <mesh geometry={GEO.sphere} material={DM.glowGreen} position={[0.1, 1.12, 0.125]} scale={0.007} />
      <Cyl p={[0.06, 0.94, -0.12]} s={[0.012, 0.04, 0.012]} m={DM.cable} />
      {/* coffee mug */}
      <Cyl p={[0.5, 0.97, 0.05]} s={[0.04, 0.09, 0.04]} m={DM.canvas} />
      <mesh position={[0.545, 0.97, 0.05]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.022, 0.006, 6, 12]} />
        <primitive object={DM.canvas} attach="material" />
      </mesh>
      {/* brass instruments */}
      <Cyl p={[-0.1, 0.945, 0.12]} s={[0.07, 0.015, 0.07]} m={MAT.brass} />
      <Block p={[0.8 - 0.2, 0.94, -0.1]} s={[0.22, 0.01, 0.01]} m={MAT.brass} r={[0, 0.4, 0]} />
      <Block p={[0.8 - 0.2, 0.94, -0.1]} s={[0.22, 0.01, 0.01]} m={MAT.brass} r={[0, -0.4, 0]} />
      {/* barometer, wall-mounted on the aft bulkhead, face toward the room (counter-local coords) */}
      <group position={[0.55, 1.75, 0.2]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.14, 0.04, 0.14]} />
        <mesh geometry={GEO.plane} position={[0, 0, 0.022]} scale={[0.24, 0.24, 1]}>
          <meshBasicMaterial map={baro} toneMapped={false} alphaTest={0.5} />
        </mesh>
      </group>
      <Plate text="BAROMETER FALLING" width={0.34} height={0.06} position={[0.55, 1.52, 0.19]} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

function Chair({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const legs = useMemo<Item[]>(() => Array.from({ length: 5 }, (_, i) => ({ p: [Math.cos((i * Math.PI * 2) / 5) * 0.13, 0.05, Math.sin((i * Math.PI * 2) / 5) * 0.13], s: [0.28, 0.025, 0.03], r: [0, -(i * Math.PI * 2) / 5, 0] })), []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Cyl p={[0, 0.25, 0]} s={[0.03, 0.5, 0.03]} m={MAT.chrome} />
      <Instanced geo={GEO.box} mat={MAT.chrome} items={legs} />
      <Cyl p={[0, 0.52, 0]} s={[0.22, 0.07, 0.22]} m={DM.seat} />
      <Block p={[0, 0.78, -0.2]} s={[0.4, 0.4, 0.06]} m={DM.seat} r={[-0.12, 0, 0]} />
      <Block p={[0, 0.62, -0.17]} s={[0.04, 0.2, 0.04]} m={MAT.chrome} />
    </group>
  );
}

// ------------------------------------------------------------ wall dressing

export function Extinguisher({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Cyl p={[0, 0, 0.06]} s={[0.065, 0.42, 0.065]} m={DM.red} />
      <Cyl p={[0, 0.25, 0.06]} s={[0.03, 0.06, 0.03]} m={MAT.chrome} />
      <Block p={[0.03, 0.22, 0.06]} s={[0.1, 0.02, 0.02]} m={MAT.enamel} />
      <Block p={[0, 0.05, 0.015]} s={[0.12, 0.04, 0.02]} m={MAT.enamel} />
      <Plate text="FIRE" width={0.12} height={0.05} position={[0, -0.05, 0.13]} fg={PALETTE.lampRed} res={128} />
    </group>
  );
}

function Wipers() {
  const arms = useRef<Group[]>([]);
  useFrame(() => {
    const reduced = useStore.getState().reducedMotion;
    const a = reduced ? 0 : Math.sin(nowS() * 1.3) * 0.55;
    for (const g of arms.current) if (g) g.rotation.z = -0.5 + a;
  });
  // window centres (match Room.tsx)
  return (
    <group>
      {[-2.95, 0, 2.95].map((x, i) => (
        <group key={x} position={[x, 1.32, -3.9]} ref={(g) => void (arms.current[i] = g!)}>
          <Block p={[0, 0.5, 0]} s={[0.025, 1.0, 0.02]} m={MAT.enamel} />
          <Block p={[0, 0.9, 0]} s={[0.04, 0.12, 0.02]} m={MAT.enamel} />
        </group>
      ))}
    </group>
  );
}

function Visors() {
  return (
    <group>
      {[-2.95, 0, 2.95].map((x, i) => {
        const w = i === 1 ? 2.5 : 2.7;
        return <Block key={x} p={[x, 2.9, -3.78]} s={[w, 0.03, 0.4]} m={MAT.consoleDark} r={[0.22, 0, 0]} />;
      })}
    </group>
  );
}

function Trim() {
  // wood trim band at y 1.0 around the walls (gap for the Comms doorway)
  return (
    <group>
      <Block p={[0, 1.0, -3.94]} s={[10, 0.07, 0.03]} m={DM.trim} />
      <Block p={[0, 1.0, 3.94]} s={[10, 0.07, 0.03]} m={DM.trim} />
      <Block p={[-4.94, 1.0, 0]} s={[0.03, 0.07, 8]} m={DM.trim} />
      <Block p={[4.94, 1.0, -2.1]} s={[0.03, 0.07, 3.8]} m={DM.trim} />
      <Block p={[4.94, 1.0, 2.6]} s={[0.03, 0.07, 2.8]} m={DM.trim} />
    </group>
  );
}

function Handrails() {
  const posts = useMemo<Item[]>(() => [-3.8, -3.0, -2.2].map((z) => ({ p: [4.9, 1.12, z], s: [0.04, 0.04, 0.04] })), []);
  return (
    <group>
      <Cyl p={[4.88, 1.15, -3.0]} s={[0.018, 1.7, 0.018]} m={MAT.brassDark} r={[Math.PI / 2, 0, 0]} />
      <Instanced geo={GEO.box} mat={MAT.brassDark} items={posts} />
    </group>
  );
}

/** Port-side locker bank (starboard has the original bank). */
function Lockers() {
  const vents = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const z of [0]) for (let i = 0; i < 5; i++) out.push({ p: [0.255, 1.7 - i * 0.045, z], s: [0.01, 0.015, 0.2] });
    return out;
  }, []);
  return (
    <group>
      {/* two tall lockers on the port wall, aft end; clear of the radio desk */}
      <group position={[-4.7, 0, 3.15]} rotation={[0, 0, 0]}>
        <Block p={[0, 0.95, 0.5]} s={[0.5, 1.9, 0.4]} m={DM.locker} />
        <Block p={[0.255, 1.0, 0.5]} s={[0.01, 1.5, 0.02]} m={MAT.enamel} />
        <Block p={[0.26, 0.9, 0.42]} s={[0.02, 0.1, 0.03]} m={MAT.chrome} />
      </group>
      <Instanced geo={GEO.box} mat={DM.vent} items={vents} position={[-4.7, 0, 3.65]} />
    </group>
  );
}

// ------------------------------------------------------------ deckhead

function Deckhead() {
  const cables = useMemo<Item[]>(() => {
    const out: Item[] = [];
    // runs along x in the two trays, bundled
    for (const z of [-0.4, 2.6]) for (let i = 0; i < 4; i++) out.push({ p: [0, 3.0 + (i % 2) * 0.03, z - 0.09 + i * 0.06], s: [0.025, 9.8, 0.025], r: [0, 0, Math.PI / 2], c: i % 3 ? "#111" : "#6a1d18" });
    return out;
  }, []);
  const hangers = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const z of [-0.4, 2.6]) for (let x = -4.5; x <= 4.5; x += 1.5) out.push({ p: [x, 3.08, z], s: [0.03, 0.14, 0.2] });
    return out;
  }, []);
  const cross = useMemo<Item[]>(() => [-3.6, -1.8, 1.8, 3.6].map((x) => ({ p: [x, 3.09, 0], s: [0.14, 0.2, 8] })), []);
  const boltsA = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const x of [-3.6, -1.8, 1.8, 3.6]) for (let z = -3.6; z <= 3.6; z += 0.9) out.push({ p: [x, 2.98, z], s: [0.05, 0.02, 0.05] });
    return out;
  }, []);
  return (
    <group>
      <Instanced geo={GEO.box} mat={MAT.bulkheadDark} items={cross} />
      <Instanced geo={GEO.box} mat={MAT.brassDark} items={boltsA} />
      <Instanced geo={GEO.box} mat={MAT.pipe} items={hangers} />
      <Instanced geo={GEO.cyl12} mat={DM.cable} items={cables} />
      {/* trays */}
      {[-0.4, 2.6].map((z) => (
        <Block key={z} p={[0, 2.97, z]} s={[10, 0.02, 0.3]} m={MAT.pipe} />
      ))}
      {/* junction boxes with a status LED (props) */}
      {[-2.8, 2.9].map((x) => (
        <group key={x} position={[x, 2.9, -0.4]}>
          <Block p={[0, 0, 0]} s={[0.3, 0.16, 0.22]} m={MAT.console} />
          <mesh geometry={GEO.sphere} material={DM.glowAmber} position={[0.1, -0.082, 0.0]} scale={0.014} />
        </group>
      ))}
      {/* loudspeaker horn above the aft door */}
      <group position={[3.6, 2.75, 3.75]}>
        <mesh geometry={GEO.cyl} material={MAT.enamel} rotation={[Math.PI / 2, 0, 0]} scale={[0.14, 0.2, 0.14]} />
        <mesh geometry={GEO.cyl} material={MAT.pipe} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.14]} scale={[0.06, 0.12, 0.06]} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ root

/** Layout of the solids Dressing adds (merged into BRIDGE_LAYOUT). */
export const DRESS_SOLIDS = {
  helm: { x: 1.375, z: -3.62, w: 0.6, d: 0.5 },
  telegraph: { x: -1.8, z: -3.72, w: 0.3, d: 0.3 },
  binnacle: { x: -1.0, z: -3.7, w: 0.4, d: 0.4 },
  counter: { x: -2.0, z: 3.62, w: 1.7, d: 0.55 },
  chair: { x: -3.3, z: 3.3, w: 0.5, d: 0.5 },
  lockers: { x: -4.7, z: 3.65, w: 0.5, d: 0.4 },
} as const;

export function Dressing() {
  const D = DRESS_SOLIDS;
  return (
    <group>
      <Helm position={[D.helm.x, 0, D.helm.z]} />
      <Telegraph position={[D.telegraph.x, 0, D.telegraph.z]} />
      <Binnacle position={[D.binnacle.x, 0, D.binnacle.z]} />
      <Counter position={[D.counter.x, 0, D.counter.z]} />
      <Chair position={[D.chair.x, 0, D.chair.z]} rotationY={Math.PI * 0.8} />
      <Extinguisher position={[4.9, 1.0, -2.5]} rotationY={-Math.PI / 2} />
      <Wipers />
      <Visors />
      <Trim />
      <Handrails />
      <Lockers />
      <Deckhead />
    </group>
  );
}
