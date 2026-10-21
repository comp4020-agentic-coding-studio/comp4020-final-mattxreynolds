// POWER station: six knife-switch breakers, each with a glyph plate, raised
// load studs, a CLOSED / OPEN flag and a numbered position plate; the
// generator LOAD meter (numbers only: the rating is the Bridge's); the TRIPPED lamp.

import { useCallback } from "react";
import type { Glyph } from "../../../shared/glyphs.ts";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable, useLatched } from "../interact.tsx";
import { drawGlyph } from "../glyphDraw.ts";
import { PALETTE } from "../palette.ts";
import { Dial, Lamp, Lever, type DialSpec } from "../parts.tsx";
import { At, B, CanvasPlane, C, drawPlate, ev, G, M, Plate, STAGE, useEV, useEVs, useStage } from "./kit.tsx";
import { AT } from "./layout.ts";

const N = 6;
const PITCH = 0.36;
const ROW_Y = 1.42;

function GlyphPlate({ glyph, position }: { glyph: Glyph | null; position: [number, number, number] }) {
  return (
    <CanvasPlane
      w={0.24}
      h={0.24}
      px={256}
      position={position}
      glow={0.6}
      deps={[glyph]}
      draw={(ctx, W, H) => {
        ctx.fillStyle = PALETTE.dialFace;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = PALETTE.brassDark;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, W - 10, H - 10);
        ctx.strokeStyle = ctx.fillStyle = PALETTE.dialInk;
        if (glyph) drawGlyph(ctx, glyph, W / 2, H / 2, W * 0.72);
        else {
          ctx.font = `900 ${W * 0.5}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("?", W / 2, H / 2);
        }
      }}
    />
  );
}

function Breaker({ i, x }: { i: number; x: number }) {
  const m = M();
  const [glyph, load, closed] = useEVs((v) => {
    const b = v?.power.breakers[i];
    return [b?.glyph ?? null, b?.load ?? 0, b?.closed ?? false] as [Glyph | null, number, boolean];
  });
  const tripped = useEV((v) => v.power.tripped, false);
  const { stage } = useStage();
  const live = stage === STAGE.POWER;
  const solved = stage > STAGE.POWER;
  const latch = useLatched(closed);
  const toggle = useCallback(() => {
    const want = !latch.get();
    latch.set(want);
    void send({ t: "setBreaker", index: i, closed: want }).then((a) => a.ok || latch.clear());
  }, [i, latch]);
  const name = `Breaker ${i + 1} of ${N}`;
  const state = closed ? "CLOSED" : "OPEN";
  let prompt: string;
  if (stage < STAGE.POWER) prompt = `${name} — ${state} · switchboard dead`;
  else if (solved) prompt = `${name} — ${state} · locked, generator online`;
  else if (tripped && !closed) prompt = `${name} — OPEN · generator tripped, wait for reset`;
  else prompt = `${name} — ${state} · E to ${closed ? "open" : "close"}`;

  return (
    <At p={[x, 0, 0]}>
      {/* numbered position plate */}
      <Plate text={String(i + 1)} w={0.14} h={0.11} position={[0, 2.07, 0.1]} glow={0.6} />
      <GlyphPlate glyph={glyph} position={[0, 1.88, 0.1]} />
      {/* load pips: raised black studs (●) for each unit of load, empty rings (○) for the rest */}
      <Plate text="" w={0.26} h={0.17} position={[0, 1.655, 0.095]} bg={PALETTE.dialFace} glow={0.55} />
      {[0, 1, 2].map((k) => (
        <group key={k} position={[(k - 1) * 0.075, 1.685, 0.1]}>
          {k < load ? (
            <mesh geometry={G().sphere} material={m.enamel} scale={[0.055, 0.055, 0.04]} />
          ) : (
            <mesh geometry={G().torus} material={m.enamel} scale={[0.024, 0.024, 0.05]} />
          )}
        </group>
      ))}
      <CanvasPlane
        w={0.24}
        h={0.055}
        px={256}
        position={[0, 1.61, 0.1]}
        glow={0.55}
        deps={[load]}
        draw={(ctx, W, H) => drawPlate(ctx, W, H, `LOAD ${load}`, { bg: PALETTE.dialFace, fg: PALETTE.dialInk })}
      />
      <Interactable id={IDS.breaker(i)} prompt={prompt} onUse={live ? toggle : undefined} position={[0, ROW_Y, 0.1]}>
        <B p={[0, -0.04, 0]} s={[0.26, 0.34, 0.04]} m={m.enamel} />
        {/* contact jaws */}
        <B p={[-0.05, 0.1, 0.03]} s={[0.03, 0.06, 0.04]} m={closed ? m.brass : m.brassDark} />
        <B p={[0.05, 0.1, 0.03]} s={[0.03, 0.06, 0.04]} m={closed ? m.brass : m.brassDark} />
        {/* blade: up into the jaws = CLOSED, swung down and out = OPEN */}
        <Lever position={[0, -0.14, 0.05]} angle={closed ? 0 : 1.15} length={0.25} thickness={0.035} knob={PALETTE.valveRed} armMaterial={m.brass} />
      </Interactable>
      {/* state flag: shape + text + colour */}
      <Plate
        text={closed ? "CLOSED" : "OPEN"}
        w={0.26}
        h={0.09}
        position={[0, 1.13, 0.1]}
        bg={closed ? "#1d5a33" : "#4a1712"}
        glow={0.8}
      />
    </At>
  );
}

function LoadMeter() {
  // the generator's rating is on the Bridge's diagram, not here (docs/PUZZLES.md)
  const max = 9;
  const spec: DialSpec = {
    min: 0,
    max,
    ticks: Array.from({ length: max + 1 }, (_, v) => ({ v, label: String(v) })),
    minor: 0.5,
    title: "GENERATOR LOAD",
    subtitle: "UNITS",
    zones: [],
    marks: [],
  };
  return <Dial position={[0, 0, 0]} diameter={0.5} spec={spec} specKey="load" value={() => ev()?.power.load ?? 0} />;
}

export function Switchboard() {
  const m = M();
  const tripped = useEV((v) => v.power.tripped, false);
  const { stage } = useStage();
  const online = useEV((v) => v.power.online, false) || stage > STAGE.POWER;
  const W = N * PITCH + 0.2;

  return (
    <At p={AT.switchboard}>
      {/* cabinet */}
      <B p={[0, 1.2, 0.04]} s={[W + 0.9, 2.4, 0.08]} m={m.panel} />
      <B p={[0, 2.43, 0.12]} s={[W + 0.95, 0.06, 0.24]} m={m.steel} />
      <B p={[0, 0.25, 0.15]} s={[W + 0.9, 0.5, 0.3]} m={m.cabinet} />
      <B p={[0, 0.25, 0.305]} s={[W + 0.5, 0.3, 0.01]} m={m.grille} />
      <Plate text="MAIN SWITCHBOARD" w={1.5} h={0.16} position={[-0.35, 2.3, 0.085]} glow={0.7} />
      {/* breaker row */}
      <group position={[-0.35, 0, 0]}>
        <B p={[0, 1.6, 0.085]} s={[W, 1.15, 0.01]} m={m.enamel} />
        {Array.from({ length: N }, (_, i) => (
          <Breaker key={i} i={i} x={(i - (N - 1) / 2) * PITCH} />
        ))}
        <Plate text="UP = CLOSED  ·  DOWN = OPEN" w={1.6} h={0.08} position={[0, 1.0, 0.09]} glow={0.5} />
      </group>
      {/* meter column on the right */}
      <group position={[W / 2 + 0.12, 0, 0.1]}>
        <B p={[0, 1.65, -0.01]} s={[0.66, 1.25, 0.02]} m={m.enamel} />
        <group position={[0, 1.88, 0.01]}>
          <LoadMeter />
        </group>
        <Lamp position={[-0.17, 1.38, 0.02]} color={PALETTE.lampRed} size={0.075} level={() => {
          const v = ev();
          if (!v?.power.tripped) return 0;
          return Math.sin(performance.now() / 120) > 0 ? 1 : 0.35;
        }} />
        <Plate text={tripped ? "TRIPPED" : "TRIP"} w={0.3} h={0.09} position={[0.1, 1.38, 0.01]} bg={tripped ? "#6a1810" : PALETTE.plateBg} glow={tripped ? 1 : 0.4} />
        <Lamp position={[-0.17, 1.17, 0.02]} color={PALETTE.lampGreen} size={0.075} level={() => (online ? 1 : 0)} />
        <Plate text={online ? "ONLINE" : "OFFLINE"} w={0.3} h={0.09} position={[0.1, 1.17, 0.01]} bg={online ? "#1d5a33" : PALETTE.plateBg} glow={0.6} />
      </group>
      {/* bus bars over the top */}
      {[-0.06, 0, 0.06].map((dy) => (
        <C key={dy} p={[-0.35, 2.2 + dy, 0.1]} d={0.025} l={W - 0.1} m={m.brassDark} r={[0, 0, Math.PI / 2]} />
      ))}
    </At>
  );
}
