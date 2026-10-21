// Phase 2 — damage-control map and the three glyph-labelled pump switches.

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { Group } from "three";
import { FLOOD } from "../../../shared/config.ts";
import type { Glyph } from "../../../shared/glyphs.ts";
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
const RISER = 1.05;

export function FloodConsole({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("FLOOD");
  const levels = useNavSlice((v) => v.flood.levels, { FORE: 0, CARGO: 0, ENGINE: 0 });
  const trends = useNavSlice((v) => v.flood.trends, { FORE: 0, CARGO: 0, ENGINE: 0 } as FloodData["trends"]);
  const pumps = useNavSlice((v) => v.flood.pumps, [] as { glyph: Glyph; on: boolean }[]);
  const stable = useNav((v) => v.flood.stable, false);
  const running = pumps.filter((p) => p.on).length;

  const map = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else if (mode === "standby") drawStandby(ctx, w, h, "DAMAGE CONTROL", "AWAITING POWER", "PUMPS NEED EMERGENCY POWER ONLINE");
      else drawFlood(ctx, w, h, { levels, trends, running, stable: stable || mode === "done", target: FLOOD.targetLevel });
    },
    [mode, levels, trends, running, stable],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ConsoleBody w={W} riserH={RISER}>
        <Screen map={map} width={1.52} height={0.95} position={[0, 0.9 + RISER / 2 + 0.03, RISER_Z]} delay={0.3} flashOn={["floodStable", "burst"]} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text={`PUMP BUS — MAX ${FLOOD.maxPumps} PUMPS`} width={0.86} height={0.075} position={[0, 0.155, 0.03]} border={PALETTE.hazardYellow} fg={PALETTE.lampAmber} />
          {[0, 1, 2].map((i) => (
            <PumpSwitch key={i} index={i} x={-0.6 + i * 0.6} mode={mode} glyph={pumps[i]?.glyph ?? null} on={pumps[i]?.on ?? false} running={running} stable={stable} />
          ))}
        </Slope>
      </ConsoleBody>
    </group>
  );
}

function PumpSwitch(props: { index: number; x: number; mode: StationMode; glyph: Glyph | null; on: boolean; running: number; stable: boolean }) {
  const { index, x, mode, glyph, on, running, stable } = props;
  const rocker = useRef<Group>(null);
  const flashAt = useRef(-10);
  const pending = useRef<boolean | null>(null);
  const active = mode === "active" && !stable && glyph !== null;
  const showOn = mode === "done" || stable ? true : on;

  // a burst drops the pump that was running on the burst compartment; we
  // don't know which pump that is (hidden pipework), so flash any switch
  // that just went from ON to OFF without us asking
  const prevOn = useRef(on);
  useEffect(() => {
    if (prevOn.current && !on && pending.current !== false) flashAt.current = nowS();
    prevOn.current = on;
    pending.current = null;
  }, [on]);

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
    pending.current = !on;
    void send({ t: "setPump", pump: index, on: !on }).then((ack) => {
      if (!ack.ok) pending.current = null;
    });
  }, [active, on, index]);

  const prompt =
    mode === "dead" || mode === "standby"
      ? `${label} — no pump power yet`
      : mode === "done" || stable
        ? `${label} — LOCKED RUNNING · flooding stabilised`
        : on
          ? `${label} — ON · E to stop`
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
      <Plate text={mode === "dead" ? "" : showOn ? "ON" : "OFF"} width={0.1} height={0.05} position={[0.06, -0.11, 0.03]} fg={showOn ? PALETTE.lampGreen : "#c9c2ae"} />
      <Lamp on={mode !== "dead" && showOn} color={PALETTE.lampGreen} r={0.025} position={[0.2, 0.06, 0.01]} />
      <Plate text="RUN" width={0.08} height={0.04} position={[0.2, 0.0, 0.03]} fg="#c9c2ae" />
      <Plate text={`${index + 1}`} width={0.05} height={0.05} position={[-0.17, -0.1, 0.03]} fg="#c9c2ae" />
    </group>
  );
}

