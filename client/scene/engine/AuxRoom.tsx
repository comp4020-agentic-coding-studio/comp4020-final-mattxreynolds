// The Auxiliary Machinery Room, west of the Engine Room through a watertight
// bulkhead door (layout.ts AUX). The door is dogged shut (and solid, see
// ENGINE_LAYOUT.doors) until roomOpen("AUX") — from FLOOD on — then backs out
// of its frame and slides into the bulkhead. A SEALED/OPEN plate pairs with
// the red/green lamp over the door. Inside: the generator plant panel
// (PlantPanel.tsx), the auxiliary generator set whose shaft tracks the load
// and stops when tripped, and the ship's plates. One point light.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ExtrudeGeometry, Group, MeshStandardMaterial, PointLight } from "three";
import { roomOpen } from "../../../shared/protocol.ts";
import { useStore } from "../../store.ts";
import { PALETTE } from "../palette.ts";
import { Lamp } from "../parts.tsx";
import { kicks } from "./Effects.tsx";
import { At, B, C, ev, G, M, MR, Pipe, Plate, useEVs } from "./kit.tsx";
import { FirePanel } from "./Incident.tsx";
import { AUX, AUX_AT, AUX_CX, AUX_CZ, AUX_D, AUX_W, FACE } from "./layout.ts";
import { AuxDressing, AuxGeneratorDetail } from "./Dressing.tsx";
import { PlantPanel } from "./PlantPanel.tsx";
import { roundRect } from "./Shell.tsx";

/** Is the Aux Machinery Room open in the current view (read per frame). */
export function auxOpenNow(): boolean {
  const v = useStore.getState().view;
  return v ? roomOpen("AUX", v.phase, v.outcome?.phaseReached) : false;
}

function useAuxOpen(): boolean {
  return useEVs((v) => [v ? roomOpen("AUX", v.phase, v.outcome?.phaseReached) : false] as [boolean])[0];
}

// ---------------------------------------------------------------- door

function BulkheadDoor() {
  const m = M();
  const open = useAuxOpen();
  const slide = useRef<Group>(null);
  const wheel = useRef<Group>(null);
  const cur = useRef(auxOpenNow() ? 1 : 0);
  const leaf = useMemo(
    () => new ExtrudeGeometry(roundRect(AUX.doorW + 0.16, AUX.doorH + 0.1, 0.24, 0.02), { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 8 }),
    [],
  );
  useFrame((_, dt) => {
    const target = auxOpenNow() ? 1 : 0;
    const reduced = useStore.getState().reducedMotion;
    const d = target - cur.current;
    cur.current = reduced ? target : cur.current + Math.sign(d) * Math.min(Math.abs(d), dt * 0.45);
    const k = cur.current;
    // first 25 %: the wheel spins and the leaf backs into the bulkhead
    // cavity; then it slides sideways (world +z) out of sight inside it
    const unlock = Math.min(1, k / 0.25);
    const slideK = Math.max(0, (k - 0.25) / 0.75);
    if (wheel.current) wheel.current.rotation.z = -unlock * Math.PI * 3;
    if (slide.current) {
      slide.current.position.x = -slideK * (AUX.doorW + 0.3);
      slide.current.position.z = -0.09 - unlock * 0.12;
    }
  });
  const dw = AUX.doorW + 0.34;
  return (
    // authored facing +Z on the engine side; turned to face +X (into the
    // Engine Room), so local +x is world −z
    <At p={[AUX.wallE, 0, AUX.doorZ]} r={[0, FACE.west, 0]}>
      <group>
        {/* coaming frame */}
        <B p={[-dw / 2 + 0.08, AUX.doorH / 2 + 0.06, 0.06]} s={[0.16, AUX.doorH + 0.24, 0.12]} m={m.steel} />
        <B p={[dw / 2 - 0.08, AUX.doorH / 2 + 0.06, 0.06]} s={[0.16, AUX.doorH + 0.24, 0.12]} m={m.steel} />
        <B p={[0, AUX.doorH + 0.12, 0.06]} s={[dw, 0.2, 0.12]} m={m.steel} />
        <B p={[0, 0.06, 0.06]} s={[dw, 0.12, 0.14]} m={m.hazard} />
        {/* the leaf */}
        <group ref={slide} position={[0, 0, -0.09]}>
          <mesh geometry={leaf} material={m.cabinet} />
          {[
            [-AUX.doorW / 2 - 0.02, 0.5],
            [-AUX.doorW / 2 - 0.02, 1.6],
            [AUX.doorW / 2 + 0.02, 0.5],
            [AUX.doorW / 2 + 0.02, 1.6],
          ].map(([x, y], i) => (
            <B key={i} p={[x, y, 0.12]} s={[0.12, 0.06, 0.06]} m={m.steel} />
          ))}
          <group ref={wheel} position={[0, 1.15, 0.14]}>
            <mesh geometry={G().torus} material={m.valveRed} scale={[0.45, 0.45, 1]} />
            {[0, 1, 2].map((k) => (
              <B key={k} p={[0, 0, 0]} s={[0.45, 0.03, 0.03]} m={m.valveRed} r={[0, 0, (k * Math.PI) / 3]} />
            ))}
          </group>
          <Plate text={"AUX\nMACHINERY"} w={0.62} h={0.24} position={[0, 1.62, 0.1]} glow={0.7} />
          <Plate text="KEEP CLOSED AT SEA" w={0.7} h={0.08} position={[0, 0.65, 0.1]} border={PALETTE.hazardYellow} glow={0.5} />
        </group>
        {/* stencil over the door, the status lamp and its plate */}
        <Plate text="AUX MACHINERY" w={1.2} h={0.16} position={[0, AUX.doorH + 0.42, 0.02]} border={PALETTE.brass} glow={0.8} />
        <Lamp position={[-0.32, AUX.doorH + 0.68, 0.04]} color={open ? PALETTE.lampGreen : PALETTE.lampRed} size={0.08} level={() => (auxOpenNow() ? 1 : 0.9)} />
        <Plate
          text={open ? "OPEN" : "SEALED"}
          w={0.42}
          h={0.11}
          position={[0.1, AUX.doorH + 0.68, 0.02]}
          bg={open ? "#1d5a33" : "#6a1810"}
          glow={0.9}
        />
      </group>
    </At>
  );
}

// ---------------------------------------------------------------- room shell

function AuxShell() {
  const m = M();
  const { minX, maxX, minZ, maxZ, h } = AUX;
  const deck = MR("deck", AUX_W, AUX_D);
  const wallNS = MR("wall10", AUX_W / 2, 1);
  const wallEW = MR("wall10", AUX_D / 2, 1);
  // west face of the bulkhead (aux side) in pieces around the doorway
  const southLen = maxZ - (AUX.doorZ + AUX.doorW / 2 + 0.17);
  const northLen = AUX.doorZ - AUX.doorW / 2 - 0.17 - minZ;
  const gap = AUX.doorW + 0.34;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[AUX_CX, 0, AUX_CZ]} material={deck}>
        <planeGeometry args={[AUX_W, AUX_D]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[AUX_CX, h, AUX_CZ]} material={m.ceiling}>
        <planeGeometry args={[AUX_W, AUX_D]} />
      </mesh>
      <mesh position={[AUX_CX, h / 2, minZ]} material={wallNS}>
        <planeGeometry args={[AUX_W, h]} />
      </mesh>
      <mesh position={[AUX_CX, h / 2, maxZ]} rotation={[0, Math.PI, 0]} material={wallNS}>
        <planeGeometry args={[AUX_W, h]} />
      </mesh>
      <mesh position={[minX, h / 2, AUX_CZ]} rotation={[0, Math.PI / 2, 0]} material={wallEW}>
        <planeGeometry args={[AUX_D, h]} />
      </mesh>
      {/* east wall (bulkhead, aux side) around the doorway */}
      <mesh position={[maxX, h / 2, maxZ - southLen / 2]} rotation={[0, -Math.PI / 2, 0]} material={MR("wall10", southLen / 2, 1)}>
        <planeGeometry args={[southLen, h]} />
      </mesh>
      <mesh position={[maxX, h / 2, minZ + northLen / 2]} rotation={[0, -Math.PI / 2, 0]} material={MR("wall10", northLen / 2, 1)}>
        <planeGeometry args={[northLen, h]} />
      </mesh>
      <B p={[maxX - 0.02, (h + AUX.doorH + 0.22) / 2, AUX.doorZ]} s={[0.04, h - AUX.doorH - 0.22, gap]} m={m.beam} />
      {/* the doorway's reveal through the bulkhead (thickness), and its sill */}
      <B p={[(AUX.wallE + AUX.wallW) / 2, AUX.doorH + 0.11, AUX.doorZ]} s={[0.3, 0.22, gap]} m={m.steel} />
      <B p={[(AUX.wallE + AUX.wallW) / 2, h / 2, AUX.doorZ - gap / 2 - 0.02]} s={[0.3, h, 0.04]} m={m.beam} />
      <B p={[(AUX.wallE + AUX.wallW) / 2, h / 2, AUX.doorZ + gap / 2 + 0.02]} s={[0.3, h, 0.04]} m={m.beam} />
      <B p={[(AUX.wallE + AUX.wallW) / 2, 0.03, AUX.doorZ]} s={[0.3, 0.06, gap]} m={m.hazard} />
      {/* frames + skirting */}
      {[-9.3, -7.3].map((x) => (
        <group key={x}>
          <B p={[x, h - 0.09, AUX_CZ]} s={[0.16, 0.18, AUX_D]} m={m.beam} />
          <B p={[x, h / 2, minZ + 0.02]} s={[0.16, h, 0.04]} m={m.beam} />
          <B p={[x, h / 2, maxZ - 0.02]} s={[0.16, h, 0.04]} m={m.beam} />
        </group>
      ))}
      <B p={[AUX_CX, 0.04, minZ + 0.03]} s={[AUX_W, 0.08, 0.06]} m={m.pipeDark} />
      <B p={[AUX_CX, 0.04, maxZ - 0.03]} s={[AUX_W, 0.08, 0.06]} m={m.pipeDark} />
      {/* overhead runs: exhaust trunk and cable tray */}
      <Pipe a={[minX, 2.7, minZ + 0.35]} b={[maxX, 2.7, minZ + 0.35]} d={0.12} />
      <B p={[AUX_CX, 2.82, 2.6]} s={[AUX_W, 0.05, 0.4]} m={m.grille} />
      {/* deck grating in front of the plant panel */}
      <B p={[minX + 0.75, 0.012, AUX_AT.panel[2]]} s={[0.9, 0.02, 2.0]} m={m.grille} />
    </group>
  );
}

// ---------------------------------------------------------------- aux generator set

function AuxGenerator() {
  const m = M();
  const shaft = useRef<Group>(null);
  const speed = useRef(0);
  const manifoldMat = useMemo(() => new MeshStandardMaterial({ color: "#3a3532", emissive: "#ff5a1a", emissiveIntensity: 0, roughness: 0.5, metalness: 0.4 }), []);
  const runLamp = useMemo(() => new MeshStandardMaterial({ color: "#20302a", emissive: "#5cffb0", emissiveIntensity: 0, roughness: 0.4 }), []);
  const [tripped, live] = useEVs((v) => [v?.grid.tripped ?? false, v ? roomOpen("AUX", v.phase, v.outcome?.phaseReached) && v.phase !== "LOST" : false] as [boolean, boolean]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const v = ev();
    const running = v && !v.grid.tripped && roomOpen("AUX", v.phase, v.outcome?.phaseReached) && v.phase !== "LOST";
    // turns faster under load; labours (slows) when overloaded
    const ratio = v ? v.grid.load / Math.max(1, v.grid.output) : 0;
    const want = running ? 6 + Math.min(1, ratio) * 8 - Math.max(0, ratio - 1) * 6 : 0;
    speed.current += (want - speed.current) * Math.min(1, dt * (want > speed.current ? 0.6 : 0.9));
    if (shaft.current) shaft.current.rotation.x += speed.current * dt;
    // the exhaust manifold glows with heat (above ~40 %)
    const heat = v?.grid.heat ?? 0;
    const t = performance.now() / 1000;
    manifoldMat.emissiveIntensity = Math.max(0, (heat - 40) / 60) * (1.8 + Math.sin(t * 9) * 0.15);
    runLamp.emissiveIntensity = running ? 1.2 : 0;
  });
  return (
    <At p={AUX_AT.machine}>
      <B p={[0, 0.1, 0]} s={[3.0, 0.2, 1.1]} m={m.pipeDark} />
      <AuxGeneratorDetail />
      {/* diesel block */}
      <B p={[-0.55, 0.68, 0]} s={[1.5, 0.95, 0.85]} m={m.green} />
      <B p={[-0.55, 1.24, 0]} s={[1.3, 0.16, 0.6]} m={m.steel} />
      {[-1.05, -0.72, -0.39, -0.06].map((x) => (
        <B key={x} p={[x, 1.4, 0]} s={[0.26, 0.16, 0.4]} m={m.pipe} />
      ))}
      {/* exhaust manifold (glows hot) and its trunk up to the deckhead */}
      <mesh geometry={G().box} material={manifoldMat} position={[-0.55, 1.05, 0.46]} scale={[1.25, 0.12, 0.1]} />
      <Pipe a={[-1.25, 1.05, 0.46]} b={[-1.25, 1.05, -0.1]} d={0.12} m={m.pipeDark} />
      <Pipe a={[-1.25, 1.05, -0.1]} b={[-1.25, 2.7, -0.1]} d={0.16} m={m.pipeDark} />
      {/* alternator, exposed shaft with coupling (visible spin) */}
      <C p={[0.95, 0.68, 0]} d={0.8} l={0.75} m={m.steel} r={[0, 0, Math.PI / 2]} />
      <group ref={shaft} position={[0.35, 0.68, 0]}>
        <C p={[0, 0, 0]} d={0.12} l={0.42} m={m.brass} r={[0, 0, Math.PI / 2]} />
        <C p={[0, 0, 0]} d={0.34} l={0.08} m={m.brassDark} r={[0, 0, Math.PI / 2]} />
        {[0, 1, 2, 3].map((k) => (
          <B key={k} p={[0.05, Math.cos((k * Math.PI) / 2) * 0.13, Math.sin((k * Math.PI) / 2) * 0.13]} s={[0.1, 0.05, 0.05]} m={m.hazard} />
        ))}
      </group>
      {/* coupling guard (open cage so the spin shows) */}
      <B p={[0.35, 0.98, 0]} s={[0.5, 0.03, 0.5]} m={m.hazard} />
      <Plate text="GENERATOR No.2 · AUX" w={1.0} h={0.14} position={[-0.55, 0.5, 0.43]} glow={0.6} />
      <mesh geometry={G().sphere} material={runLamp} position={[0.95, 1.12, 0.3]} scale={[0.08, 0.08, 0.08]} />
      <Plate text={!live ? "STOPPED" : tripped ? "TRIPPED" : "RUNNING"} w={0.5} h={0.12} position={[0.95, 0.42, 0.405]} bg={live && !tripped ? "#1d5a33" : "#4a1712"} glow={0.8} />
      <Plate text="DANGER · ROTATING SHAFT" w={0.62} h={0.07} position={[0.35, 1.08, 0.26]} border={PALETTE.hazardYellow} glow={0.5} />
    </At>
  );
}

// ---------------------------------------------------------------- plates and notices

function ShipPlates() {
  const m = M();
  return (
    <At p={AUX_AT.plates} r={[0, FACE.south, 0]}>
      {/* builder's plate */}
      <B p={[0, 1.65, 0.015]} s={[1.3, 0.62, 0.03]} m={m.brassDark} />
      <Plate
        text={"MV KESTREL MERIDIAN\nHALVARD COASTAL LINES\nOFFICIAL No. 418 207 · BUILT 1987"}
        w={1.22}
        h={0.54}
        position={[0, 1.65, 0.032]}
        bg="#3a2c14"
        fg="#e8d29a"
        border={PALETTE.brass}
        glow={0.55}
      />
      {/* crew notice */}
      <B p={[-1.5, 1.45, 0.03]} s={[0.66, 0.86, 0.02]} m={m.enamel} />
      <Plate
        text={"CREW NOTICE\n\nNo.2 SET RUNS THE\nPUMPS, RADIO & EVAC.\nIF IT TRIPS: SHED LOAD,\nWAIT FOR READY,\nTHEN PRESS RESET.\n— C/E R. OKONJO"}
        w={0.6}
        h={0.8}
        position={[-1.5, 1.45, 0.042]}
        bg="#e9e2cc"
        fg="#1b1b1b"
        glow={0.4}
      />
      {/* maintenance tag */}
      <B p={[0.35, 1.02, 0.01]} s={[0.36, 0.3, 0.02]} m={m.hazard} />
      <Plate text={"SERVICE DUE\n500 HRS\nOVERDUE"} w={0.3} h={0.24} position={[0.35, 1.02, 0.022]} bg="#e0b31f" fg="#1a1a1a" glow={0.4} />
      {/* lube-oil drums in the corner: plain decor, nothing to press */}
      <C p={[1.2, 0.45, 0.4]} d={0.56} l={0.9} m={m.valveRed} low />
      <C p={[1.68, 0.45, 0.34]} d={0.56} l={0.9} m={m.green} low />
    </At>
  );
}

// ---------------------------------------------------------------- light

function AuxLight() {
  const light = useRef<PointLight>(null);
  const fixture = useMemo(() => new MeshStandardMaterial({ color: "#fff3d6", emissive: "#fff3d6", emissiveIntensity: 0.2 }), []);
  useFrame(() => {
    const v = ev();
    const open = auxOpenNow();
    const powered = !!v && !v.ship.gridDown && v.phase !== "LOST";
    // its own fitting on the aux switchboard: on when the room is open and the
    // grid is up; a red emergency glow otherwise (the room stays playable)
    const L = !open ? 0.05 : powered ? 1 - kicks.dip * 0.6 + kicks.flash * 0.4 : 0.35;
    if (light.current) {
      light.current.intensity = L * 7;
      light.current.color.set(powered ? "#ffe2b0" : "#ff4a30");
    }
    fixture.emissiveIntensity = powered && open ? 1.2 : 0.15;
  });
  return (
    <group position={[AUX_CX, 2.88, AUX_CZ]}>
      <mesh geometry={G().box} material={M().steel} scale={[0.7, 0.08, 0.2]} />
      <mesh geometry={G().box} material={fixture} scale={[0.6, 0.03, 0.12]} position={[0, -0.05, 0]} />
      <pointLight ref={light} position={[0, -0.3, 0]} intensity={0} distance={8} decay={1.4} />
    </group>
  );
}

export function AuxRoom() {
  return (
    <group>
      <AuxShell />
      <BulkheadDoor />
      <AuxGenerator />
      <PlantPanel />
      <ShipPlates />
      <AuxDressing />
      {/* compartment fire (ADR 006): east bulkhead, beside the doorway */}
      <At p={[AUX.wallW - 0.01, 1.45, 0.3]} r={[0, FACE.east, 0]}>
        <FirePanel />
      </At>
      <AuxLight />
    </group>
  );
}
