// Non-interactive dressing: a life ring, a lockers bank, a ship's clock, a
// name board. Nothing here looks like a usable control (CLAUDE.md inv. 9).

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { Block, GEO, MAT, Plate } from "./kit.tsx";

export function Decor() {
  return (
    <group>
      {/* clear of the Comms doorway (starboard, z 0…1.2) */}
      <LifeRing position={[4.85, 1.7, 2.5]} />
      {/* lockers on the starboard bulkhead */}
      <group position={[4.62, 0, -1.4]}>
        {[-0.42, 0, 0.42].map((z) => (
          <group key={z}>
            <Block p={[0, 0.95, z]} s={[0.5, 1.9, 0.4]} m={MAT.bulkheadDark} />
            {[1.6, 1.5].map((y) => (
              <Block key={y} p={[-0.255, y, z]} s={[0.01, 0.02, 0.25]} m={MAT.enamel} />
            ))}
          </group>
        ))}
      </group>
      <Plate text="BRIDGE · RADIO ROOM" width={1.6} height={0.18} position={[0, 2.98, -3.87]} border={PALETTE.brass} />
      <ShipClock position={[-3.6, 2.5, 3.87]} />
      <Plate text={"ABANDON SHIP STATION\nDOOR RAMS ▶"} width={0.9} height={0.2} position={[2.4, 2.45, 3.86]} rotation={[0, Math.PI, 0]} fg={PALETTE.lampAmber} />
    </group>
  );
}

function LifeRing({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh>
        <torusGeometry args={[0.28, 0.07, 10, 28]} />
        <meshStandardMaterial color="#e8e2d4" roughness={0.6} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2 + Math.PI / 4]}>
          <torusGeometry args={[0.28, 0.072, 10, 6, Math.PI / 6]} />
          <meshStandardMaterial color="#c2402f" roughness={0.6} />
        </mesh>
      ))}
      <Block p={[0, 0.36, -0.05]} s={[0.06, 0.06, 0.06]} m={MAT.brassDark} />
    </group>
  );
}

function ShipClock({ position }: { position: [number, number, number] }) {
  const minute = useRef<Group>(null);
  const hour = useRef<Group>(null);
  const face = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.dialFace;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.dialInk;
      ctx.font = "bold 34px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(String(i), w / 2 + Math.cos(a) * 96, h / 2 + Math.sin(a) * 96);
      }
    },
    [],
  );
  useFrame(() => {
    const d = new Date();
    const m = d.getMinutes() + d.getSeconds() / 60;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
  });
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.04, 0.2]} />
      <mesh geometry={GEO.plane} position={[0, 0, 0.022]} scale={[0.34, 0.34, 1]}>
        <meshBasicMaterial map={face} alphaTest={0.5} />
      </mesh>
      <group ref={hour} position={[0, 0, 0.03]}>
        <Block p={[0, 0.045, 0]} s={[0.018, 0.09, 0.005]} m={MAT.enamel} />
      </group>
      <group ref={minute} position={[0, 0, 0.034]}>
        <Block p={[0, 0.065, 0]} s={[0.012, 0.13, 0.005]} m={MAT.enamel} />
      </group>
    </group>
  );
}
