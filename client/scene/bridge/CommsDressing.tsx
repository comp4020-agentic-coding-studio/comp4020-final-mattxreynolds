// Comms Room dressing: a radio rack, a battery cabinet, cable runs. Props
// only: plates say there are no controls (invariant 9).

import { useMemo } from "react";
import { PALETTE } from "../palette.ts";
import { DM, Extinguisher } from "./Dressing.tsx";
import { Instanced, type Item } from "./inst.tsx";
import { Block, GEO, MAT, Plate } from "./kit.tsx";

export const COMMS_SOLIDS = {
  rack: { x: 9.55, z: -1.75, w: 0.6, d: 1.0 },
  battery: { x: 9.55, z: 1.75, w: 0.6, d: 1.0 },
} as const;

function RadioRack({ position }: { position: [number, number, number] }) {
  const units = useMemo<Item[]>(() => Array.from({ length: 7 }, (_, i) => ({ p: [0, 0.35 + i * 0.22, 0.27], s: [0.82, 0.18, 0.04] })), []);
  const knobs = useMemo<Item[]>(() => Array.from({ length: 7 }, (_, i) => ({ p: [-0.28, 0.35 + i * 0.22, 0.3], s: [0.04, 0.025, 0.04], r: [Math.PI / 2, 0, 0] })), []);
  const leds = useMemo<Item[]>(() => Array.from({ length: 7 }, (_, i) => ({ p: [0.3, 0.35 + i * 0.22, 0.298], s: 0.012 })), []);
  const vents = useMemo<Item[]>(() => Array.from({ length: 14 }, (_, i) => ({ p: [0.08, 0.3 + Math.floor(i / 2) * 0.22 + (i % 2) * 0.03, 0.296], s: [0.3, 0.008, 0.005] })), []);
  const screws = useMemo<Item[]>(() => Array.from({ length: 14 }, (_, i) => ({ p: [i % 2 ? 0.4 : -0.4, 0.35 + Math.floor(i / 2) * 0.22, 0.3], s: 0.012 })), []);
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <Block p={[0, 0.9, 0]} s={[1.0, 1.8, 0.5]} m={MAT.consoleDark} />
      <Block p={[0, 0.95, 0.255]} s={[0.9, 1.7, 0.01]} m={MAT.bezel} />
      <Instanced geo={GEO.box} mat={MAT.console} items={units} />
      <Instanced geo={GEO.cyl12} mat={MAT.chrome} items={knobs} />
      <Instanced geo={GEO.sphere} mat={DM.glowGreen} items={leds} />
      <Instanced geo={GEO.box} mat={DM.vent} items={vents} />
      <Instanced geo={GEO.sphere} mat={MAT.chrome} items={screws} />
      <Plate text="HF · VHF · SART  (STOWED, NO CONTROLS)" width={0.8} height={0.07} position={[0, 1.88, 0.27]} fg="#9a9586" />
    </group>
  );
}

function BatteryCabinet({ position }: { position: [number, number, number] }) {
  const slats = useMemo<Item[]>(() => Array.from({ length: 8 }, (_, i) => ({ p: [0, 0.2 + i * 0.045, 0.255], s: [0.4, 0.012, 0.008] })), []);
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <Block p={[0, 0.7, 0]} s={[1.0, 1.4, 0.5]} m={DM.locker} />
      <Block p={[-0.25, 0.7, 0.255]} s={[0.46, 1.3, 0.01]} m={MAT.consoleDark} />
      <Block p={[0.25, 0.7, 0.255]} s={[0.46, 1.3, 0.01]} m={MAT.consoleDark} />
      <Instanced geo={GEO.box} mat={DM.vent} items={slats} position={[0.25, 0.2, 0]} />
      <Block p={[0.02, 0.75, 0.27]} s={[0.03, 0.12, 0.03]} m={MAT.chrome} />
      <Block p={[0, 1.4, 0.0]} s={[1.02, 0.04, 0.54]} m={DM.hazard} />
      <Plate text={"EMERGENCY BATTERIES\n24V · KEEP CLEAR"} width={0.7} height={0.16} position={[0, 1.2, 0.262]} border={PALETTE.hazardYellow} />
    </group>
  );
}

export function CommsDressing() {
  const cables = useMemo<Item[]>(
    () => [0, 1, 2].map((i) => ({ p: [7.4, 2.1 + i * 0.05, -2.84], s: [0.03, 4.8, 0.03], r: [0, 0, Math.PI / 2], c: i === 1 ? "#6a1d18" : "#111" })),
    [],
  );
  const hangers = useMemo<Item[]>(() => [5.6, 6.8, 8.0, 9.2].map((x) => ({ p: [x, 2.1, -2.84], s: [0.03, 0.1, 0.12] })), []);
  const trim = useMemo<Item[]>(() => [{ p: [7.5, 1.0, 2.86], s: [4.9, 0.07, 0.03] }, { p: [7.5, 1.0, -2.86], s: [4.9, 0.07, 0.03] }], []);
  return (
    <group>
      <RadioRack position={[COMMS_SOLIDS.rack.x - 0.1, 0, COMMS_SOLIDS.rack.z]} />
      <BatteryCabinet position={[COMMS_SOLIDS.battery.x - 0.1, 0, COMMS_SOLIDS.battery.z]} />
      <Instanced geo={GEO.cyl12} mat={DM.cable} items={cables} />
      <Instanced geo={GEO.box} mat={MAT.pipe} items={hangers} />
      <Instanced geo={GEO.box} mat={DM.trim} items={trim} />
      <Extinguisher position={[5.1, 1.0, -2.2]} rotationY={Math.PI / 2} />
    </group>
  );
}
