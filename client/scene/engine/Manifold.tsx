// FLOOD station: the suction valve manifold on the south bulkhead. Three
// valves, each stencilled with its compartment, a red handwheel that turns
// as it opens, an OPEN / SHUT flag and a centre-zero line-pressure gauge.

import { useFrame } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import type { Group } from "three";
import { COMPARTMENT_LABEL, COMPARTMENTS, type Compartment } from "../../../shared/glyphs.ts";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable, useLatched } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Dial, type DialSpec } from "../parts.tsx";
import { At, B, C, ev, G, M, Pipe, Plate, shipLive, STAGE, useEV, useStage } from "./kit.tsx";
import { AT, FACE, VALVE_X } from "./layout.ts";

/** Centre-zero scale: −40..0 on the left third, 0..100 on the right. */
const PRESSURE_SPEC: DialSpec = {
  min: -40,
  max: 100,
  sweep: Math.PI * 1.4,
  map: (v) => (v < 0 ? 0.3 * (1 + v / 40) : 0.3 + 0.7 * (v / 100)),
  ticks: [-40, -20, 0, 20, 40, 60, 80, 100].map((v) => ({ v, label: v < 0 ? `−${-v}` : String(v) })),
  minor: 10,
  title: "LINE PRESS.",
  zones: [
    { from: -40, to: 0, color: "rgba(60,110,170,0.4)" },
    { from: 80, to: 100, color: "rgba(192,40,28,0.7)" },
  ],
  marks: [{ v: 0, color: "#1b1b1b" }],
};

function Handwheel({ c }: { c: Compartment }) {
  const m = M();
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const open = ev()?.flood.valves[c].open ?? false;
    const target = open ? -Math.PI * 3 : 0; // three turns anticlockwise to open
    g.rotation.z += (target - g.rotation.z) * Math.min(1, dt * 3);
  });
  return (
    <group ref={ref}>
      <mesh geometry={G().torus} material={m.valveRed} scale={[0.4, 0.4, 0.8]} />
      {[0, 1, 2].map((k) => (
        <B key={k} p={[0, 0, 0]} s={[0.4, 0.03, 0.03]} m={m.valveRed} r={[0, 0, (k * Math.PI) / 3]} />
      ))}
      <C p={[0, 0, 0.03]} d={0.08} l={0.06} m={m.brass} r={[Math.PI / 2, 0, 0]} />
      {/* knob on the rim: makes rotation visible */}
      <C p={[0.2, 0, 0.05]} d={0.035} l={0.08} m={m.brass} r={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function Valve({ c }: { c: Compartment }) {
  const m = M();
  const open = useEV((v) => v.flood.valves[c].open, false);
  const { phase, stage } = useStage();
  // live from FLOOD to ESCAPE: the water never stops coming (SYSTEMS.md)
  const live = shipLive(phase);
  const gridDown = useEV((v) => v.ship.gridDown, false);
  const latch = useLatched(open);
  const toggle = useCallback(() => {
    const want = !latch.get();
    latch.set(want);
    void send({ t: "setValve", compartment: c, open: want }).then((a) => a.ok || latch.clear());
  }, [c, latch]);
  const name = `Valve ${COMPARTMENT_LABEL[c]}`;
  const state = open ? "OPEN" : "SHUT";
  const prompt =
    stage < STAGE.FLOOD
      ? `${name} — ${state} · no pumps running yet`
      : !live
        ? `${name} — ${state}`
        : `${name} — ${state}${gridDown ? " · GRID DOWN, pumps stopped" : ""} · E to ${open ? "shut" : "open"}`;
  const pressure = () => ev()?.flood.valves[c].pressure ?? 0;

  return (
    <At p={[VALVE_X[c], 0, 0]}>
      <Plate text={COMPARTMENT_LABEL[c]} w={0.62} h={0.14} position={[0, 2.12, 0.1]} border={PALETTE.brass} glow={0.75} />
      <Dial position={[0, 1.74, 0.1]} diameter={0.5} spec={PRESSURE_SPEC} specKey="p" value={pressure} />
      <Plate text="BACKFLOW ← 0 → DEADHEAD" w={0.7} h={0.075} position={[0, 1.42, 0.09]} glow={0.6} />
      {/* riser from the header into the valve body */}
      <Pipe a={[0, 0.3, 0.25]} b={[0, 1.3, 0.25]} d={0.12} />
      <B p={[0, 1.05, 0.25]} s={[0.22, 0.26, 0.22]} m={m.pipeDark} />
      <C p={[0, 1.05, 0.38]} d={0.04} l={0.12} m={m.brass} r={[Math.PI / 2, 0, 0]} />
      <Interactable id={IDS.valve(c)} prompt={prompt} onUse={live ? toggle : undefined} position={[0, 1.05, 0.45]}>
        <Handwheel c={c} />
        {/* invisible-ish hit disc so the whole wheel is easy to aim at */}
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[0.42, 0.02, 0.42]} geometry={G().cyl} visible={true}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactable>
      {/* flag: text + colour + position (flag drops down when open) */}
      <Plate text={open ? "OPEN" : "SHUT"} w={0.3} h={0.11} position={[0, 0.72, 0.36]} bg={open ? "#1d5a33" : "#4a1712"} glow={0.6} />
      <Plate text="↺ OPEN  ↻ SHUT" w={0.42} h={0.07} position={[0, 0.58, 0.36]} glow={0.45} />
    </At>
  );
}

export function Manifold() {
  const m = M();
  return (
    <At p={AT.manifold} r={[0, FACE.south, 0]}>
      <B p={[0, 1.3, 0.04]} s={[3.6, 2.0, 0.08]} m={m.panel} />
      <Plate text="BILGE SUCTION MANIFOLD" w={1.9} h={0.16} position={[0, 2.43, 0.09]} glow={0.7} />
      {/* header pipe */}
      <Pipe a={[-1.8, 0.3, 0.25]} b={[1.8, 0.3, 0.25]} d={0.2} />
      {[-1.15, 0, 1.15].map((x) => (
        <C key={x} p={[x, 0.3, 0.25]} d={0.28} l={0.06} m={m.pipeDark} r={[0, 0, Math.PI / 2]} />
      ))}
      <Pipe a={[1.8, 0.3, 0.25]} b={[1.8, 2.65, 0.25]} d={0.2} />
      {COMPARTMENTS.map((c) => (
        <Valve key={c} c={c} />
      ))}
    </At>
  );
}
