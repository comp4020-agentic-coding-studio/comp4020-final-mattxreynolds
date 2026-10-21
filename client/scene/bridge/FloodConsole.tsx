// Phase 2 — damage-control map and the three glyph-labelled pump switches.

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { FLOOD } from "../../../shared/config.ts";
import type { Compartment, Glyph } from "../../../shared/glyphs.ts";
import type { Phase } from "../../../shared/protocol.ts";
import { send } from "../../net.ts";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { drawDead, drawStandby } from "./draw.ts";
import { Block, ConsoleBody, GEO, GlyphPlate, Lamp, MAT, Plate, RISER_Z, Screen, Slope, SLOPE_AT } from "./kit.tsx";
import { drawFlood, type FloodData } from "./screens.ts";
import { nowS, type StationMode, useNav, useNavSlice, useStationMode } from "./state.ts";

const W = 2.0;
const NONE: Record<Compartment, boolean> = { FORE: false, CARGO: false, ENGINE: false };
const RISER = 1.05;

export function FloodConsole({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  // pumps are live from Act II to the end (INTENT_RULES.setPump)
  const mode = useStationMode("FLOOD", "ESCAPE");
  const phase = useNav((v) => v.phase, "PROLOGUE" as Phase);
  // whole percent is what the map shows, so redraw only when that changes
  const levels = useNavSlice(
    (v) => ({ FORE: Math.round(v.flood.levels.FORE), CARGO: Math.round(v.flood.levels.CARGO), ENGINE: Math.round(v.flood.levels.ENGINE) }),
    { FORE: 0, CARGO: 0, ENGINE: 0 },
  );
  const trends = useNavSlice((v) => v.flood.trends, { FORE: 0, CARGO: 0, ENGINE: 0 } as FloodData["trends"]);
  const pumps = useNavSlice((v) => v.flood.pumps, [] as { glyph: Glyph; on: boolean }[]);
  const running = pumps.filter((p) => p.on).length;
  const held = useNav((v) => Math.floor(v.flood.held * 2) / 2, 0);
  const breached = useNavSlice((v) => v.hull.breached, NONE);
  const lost = useNavSlice((v) => v.ship.lost, NONE);
  const dry = useNavSlice((v) => v.flood.dry, NONE);
  const gridDown = useNav((v) => v.ship.gridDown, false);
  const stage: FloodData["stage"] = mode === "done" ? "done" : phase === "FLOOD" ? "flood" : "later";

  const map = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else if (mode === "standby") drawStandby(ctx, w, h, "DAMAGE CONTROL", "AWAITING POWER", "PUMPS NEED EMERGENCY POWER ONLINE");
      else drawFlood(ctx, w, h, { levels, trends, running, stage, target: FLOOD.targetLevel, held, holdS: FLOOD.holdS, breached, lost, dry, gridDown });
    },
    [mode, levels, trends, running, stage, held, breached, lost, dry, gridDown],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ConsoleBody w={W} riserH={RISER}>
        <Screen map={map} width={1.52} height={0.95} position={[0, 0.9 + RISER / 2 + 0.03, RISER_Z]} delay={0.3} flashOn={["floodStable", "burst", "breach", "compartmentLost"]} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text={`PUMP BUS — MAX ${FLOOD.maxPumps} PUMPS`} width={0.86} height={0.075} position={[0, 0.155, 0.03]} border={PALETTE.hazardYellow} fg={PALETTE.lampAmber} />
          {[0, 1, 2].map((i) => (
            <PumpSwitch key={i} index={i} x={-0.6 + i * 0.6} mode={mode} glyph={pumps[i]?.glyph ?? null} on={pumps[i]?.on ?? false} running={running} gridDown={gridDown} />
          ))}
        </Slope>
      </ConsoleBody>
    </group>
  );
}

function PumpSwitch(props: { index: number; x: number; mode: StationMode; glyph: Glyph | null; on: boolean; running: number; gridDown: boolean }) {
  const { index, x, mode, glyph, on, running, gridDown } = props;
  const rocker = useRef<Group>(null);
  const flashAt = useRef(-10);
  const pending = useRef<boolean | null>(null);
  const active = mode === "active" && glyph !== null;
  const showOn = on;

  // a burst drops the pump that was running on the burst compartment; we
  // don't know which pump that is (hidden pipework), so flash any switch
  // that just went from ON to OFF without us asking
  const prevOn = useRef(on);
  const [tripped, setTripped] = useState(false);
  useEffect(() => {
    if (prevOn.current && !on && pending.current !== false) {
      flashAt.current = nowS();
      setTripped(true);
    }
    if (on) setTripped(false);
    prevOn.current = on;
    pending.current = null;
  }, [on]);
  useEffect(() => {
    if (!tripped) return;
    const t = setTimeout(() => setTripped(false), 4000);
    return () => clearTimeout(t);
  }, [tripped]);

  useFrame(() => {
    if (!rocker.current) return;
    const target = (pending.current ?? showOn) ? -0.32 : 0.32;
    rocker.current.rotation.x += (target - rocker.current.rotation.x) * 0.35;
    const f = nowS() - flashAt.current;
    const reduced = useStore.getState().reducedMotion;
    rocker.current.position.z = f < 0.6 && !reduced ? 0.04 + Math.sin(f * 60) * 0.006 : 0.04;
  });

  const label = `Pump switch ${index + 1} of 3`;
  const onUse = useCallback(() => {
    if (!active) return;
    // act on what the switch shows (a press still in flight), not the last view
    const want = !(pending.current ?? on);
    pending.current = want;
    void send({ t: "setPump", pump: index, on: want }).then((ack) => {
      // rejected: snap back; accepted: the next view settles it (or this does)
      if (!ack.ok) pending.current = null;
      else setTimeout(() => (pending.current = null), 800);
    });
  }, [active, on, index]);

  const prompt =
    mode === "dead" || mode === "standby"
      ? `${label} — no pump power yet`
      : mode === "done"
        ? `${label} — ${on ? "ON" : "OFF"} · voyage over`
        : on
          ? `${label} — ON${gridDown ? " · NO SUPPLY (generator tripped)" : ""} · E to stop`
          : running >= FLOOD.maxPumps
            ? `${label} — OFF · bus full (2 running) — stop one first`
            : `${label} — OFF · E to start`;

  return (
    <group position={[x, -0.01, 0]}>
      <GlyphPlate glyph={mode === "dead" ? null : glyph} size={0.15} position={[-0.17, 0.02, 0.03]} dim={mode === "standby"} />
      <Interactable id={IDS.pump(index)} prompt={prompt} onUse={onUse}>
        {/* switch housing */}
        <Block p={[0.06, 0.02, 0.02]} s={[0.13, 0.19, 0.04]} m={MAT.bezel} />
        <group ref={rocker} position={[0.06, 0.02, 0.04]}>
          <mesh geometry={GEO.box} material={showOn ? MAT.brass : MAT.chrome} scale={[0.1, 0.16, 0.04]} />
        </group>
      </Interactable>
      <Plate
        text={mode === "dead" ? "" : showOn ? "ON" : tripped ? "TRIPPED" : "OFF"}
        width={tripped && !showOn ? 0.16 : 0.1}
        height={0.05}
        position={[0.06, -0.11, 0.03]}
        fg={showOn ? PALETTE.lampGreen : tripped ? PALETTE.lampAmber : "#c9c2ae"}
        bg={tripped && !showOn ? "#3a1a10" : undefined}
      />
      <Lamp on={mode !== "dead" && ((showOn && !gridDown) || tripped)} color={tripped && !showOn ? PALETTE.lampAmber : PALETTE.lampGreen} blink={tripped && !showOn} r={0.025} position={[0.2, 0.06, 0.01]} />
      <Plate text="RUN" width={0.08} height={0.04} position={[0.2, 0.0, 0.03]} fg="#c9c2ae" />
      <Plate text={`${index + 1}`} width={0.05} height={0.05} position={[-0.17, -0.1, 0.03]} fg="#c9c2ae" />
    </group>
  );
}

