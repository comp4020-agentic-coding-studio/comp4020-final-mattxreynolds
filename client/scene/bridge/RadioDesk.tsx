// Phase 3 — radio desk: tuner, receiver waveform, signal meter, reply strip,
// tune ▼/▲ and TRANSMIT; plus the chart table and the codebook card.

import { useFrame } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import type { Group } from "three";
import { RADIO } from "../../../shared/config.ts";
import { send } from "../../net.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { drawDead, drawStandby } from "./draw.ts";
import { Block, ConsoleBody, GEO, MAT, Plate, PushButton, RISER_Z, Screen, Slope, SLOPE_AT, useAnimatedCanvas, usePress } from "./kit.tsx";
import { drawChart, drawCodebook, drawReply, drawSignal, drawTuner, drawWave, mhz, type StationData } from "./screens.ts";
import { navView, useNav, useNavSlice, useStationMode } from "./state.ts";

const W = 2.8;
const RISER = 1.05;
const TOP = 0.9 + RISER;

export function RadioDesk({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("RADIO");
  const channel = useNav((v) => v.radio.channel, 0);
  const coupled = useNav((v) => v.radio.coupled, false);
  const contact = useNav((v) => v.radio.contact, false);
  const signal = useNav((v) => v.radio.signal, 0);
  const reply = useNav((v) => v.radio.lastReply, null);
  const active = mode === "active";
  const live = mode === "active" || mode === "done";

  const tuner = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else if (mode === "standby") drawStandby(ctx, w, h, "TUNER", "AWAITING POWER", "RADIO MAST NEEDS POWER AND PUMPS");
      else drawTuner(ctx, w, h, channel, coupled || mode === "done");
    },
    [mode, channel, coupled],
  );
  const wave = useAnimatedCanvas(768, 384, (ctx, w, h, t) => {
    const v = navView();
    const m = mode;
    if (m === "dead") return drawDead(ctx, w, h);
    drawWave(ctx, w, h, !!v?.radio.coupled || m === "done", t, m === "standby");
  }, 8);
  const meter = useCanvasTexture(
    640,
    512,
    (ctx, w, h) => (mode === "dead" ? drawDead(ctx, w, h) : drawSignal(ctx, w, h, signal, active && coupled)),
    [mode, signal, active, coupled],
  );
  const replyTex = useCanvasTexture(
    1536,
    220,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else drawReply(ctx, w, h, live ? (mode === "done" ? "contact" : reply) : null, coupled);
    },
    [mode, reply, coupled, live],
  );

  // ----- controls
  const down = usePress();
  const up = usePress();
  const tx = usePress();
  const step = useCallback(
    (dir: -1 | 1) => {
      const v = navView();
      if (!v || v.phase !== "RADIO" || v.radio.coupled) return;
      const next = Math.max(0, Math.min(RADIO.channels - 1, v.radio.channel + dir));
      if (next === v.radio.channel) return;
      void send({ t: "tune", channel: next });
    },
    [],
  );
  const onDown = useCallback(() => (down.press(), step(-1)), [down, step]);
  const onUp = useCallback(() => (up.press(), step(1)), [up, step]);
  const onTx = useCallback(() => {
    tx.press();
    const v = navView();
    if (v && v.phase === "RADIO" && !v.radio.contact) void send({ t: "transmit" });
  }, [tx]);

  const freq = `${mhz(channel)} MHz`;
  const tunePrompt = (dir: "▼" | "▲"): string => {
    const name = `Tune ${dir}`;
    if (!active) return `${name} — radio has no power yet`;
    if (coupled) return `${name} — ${freq} · CARRIER LOCKED, tuning fixed`;
    const edge = dir === "▼" ? channel <= 0 : channel >= RADIO.channels - 1;
    if (edge) return `${name} — ${freq} · end of band`;
    return `${name} — ${freq} · E to step ${dir === "▼" ? "down" : "up"}`;
  };
  const txPrompt = !active
    ? mode === "done"
      ? "Transmit — CONTACT MADE · rescue inbound"
      : "Transmit — radio has no power yet"
    : contact
      ? "Transmit — CONTACT MADE · rescue inbound"
      : !coupled
        ? "Transmit — NO CARRIER · couple the transmitter first"
        : "Transmit — carrier ready · E to send distress call";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ConsoleBody w={W} riserH={RISER}>
        <Screen map={tuner} width={0.96} height={0.6} position={[-0.84, TOP - 0.38, RISER_Z]} delay={0.45} />
        <Screen map={wave} width={0.8} height={0.4} position={[0.3, TOP - 0.28, RISER_Z]} delay={0.5} flashOn={["coupled"]} />
        <Screen map={meter} width={0.42} height={0.336} position={[1.06, TOP - 0.26, RISER_Z]} delay={0.55} bezel={0.03} />
        <Screen map={replyTex} width={1.6} height={0.229} position={[0.5, 0.9 + 0.22, RISER_Z]} delay={0.6} flashOn={["reply"]} />
        <Plate text="DISTRESS RADIO" width={0.5} height={0.07} position={[-1.12, 0.9 + 0.13, RISER_Z]} border={PALETTE.brassDark} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <group position={[-1.1, 0, 0]}>
            <Interactable id={IDS.tuneDown} prompt={tunePrompt("▼")} onUse={onDown}>
              <PushButton color="#c9c2ae" r={0.05} lit={active && !coupled} depth={down.depth} />
            </Interactable>
            <Plate text="▼ TUNE" width={0.16} height={0.06} position={[0, -0.1, 0.03]} />
          </group>
          <ChannelDial channel={channel} />
          <group position={[-0.5, 0, 0]}>
            <Interactable id={IDS.tuneUp} prompt={tunePrompt("▲")} onUse={onUp}>
              <PushButton color="#c9c2ae" r={0.05} lit={active && !coupled} depth={up.depth} />
            </Interactable>
            <Plate text="TUNE ▲" width={0.16} height={0.06} position={[0, -0.1, 0.03]} />
          </group>
          <group position={[0.85, 0, 0]}>
            <Interactable id={IDS.transmit} prompt={txPrompt} onUse={onTx}>
              <PushButton color="#d8301f" r={0.075} lit={active && coupled && !contact} blink={false} depth={tx.depth} />
            </Interactable>
            <Plate text="TRANSMIT" width={0.26} height={0.065} position={[0, -0.13, 0.03]} border={PALETTE.brass} />
          </group>
        </Slope>
      </ConsoleBody>
    </group>
  );
}

/** A big knurled channel knob between the tune buttons; turns with the channel. */
function ChannelDial({ channel }: { channel: number }) {
  const knob = useRef<Group>(null);
  const live = useRef(channel);
  live.current = channel;
  useFrame(() => {
    if (!knob.current) return;
    const target = -(live.current / (RADIO.channels - 1)) * Math.PI * 1.5 + Math.PI * 0.75;
    knob.current.rotation.z += (target - knob.current.rotation.z) * 0.2;
  });
  const face = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.dialFace;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.dialInk;
      ctx.lineWidth = 4;
      for (let i = 0; i < RADIO.channels; i++) {
        const a = Math.PI * 0.75 + (i / (RADIO.channels - 1)) * Math.PI * 1.5;
        const r0 = i % 4 === 0 ? 92 : 104;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
        ctx.lineTo(w / 2 + Math.cos(a) * 120, h / 2 + Math.sin(a) * 120);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.dialInk;
      ctx.font = "bold 30px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("CH", w / 2, h - 34);
    },
    [],
  );
  return (
    <group position={[-0.8, 0.01, 0.01]}>
      <mesh geometry={GEO.plane} scale={[0.2, 0.2, 1]} position={[0, 0, 0.012]}>
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
      <group ref={knob} position={[0, 0, 0.03]}>
        <mesh geometry={GEO.cyl} material={MAT.enamel} rotation={[Math.PI / 2, 0, 0]} scale={[0.065, 0.04, 0.065]} />
        <Block p={[0, 0.045, 0.024]} s={[0.012, 0.04, 0.006]} m={MAT.brass} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ chart table

export function ChartTable({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("RADIO");
  const stations = useNavSlice((v) => v.radio.stations, [] as StationData);
  const issued = (mode === "active" || mode === "done") && stations.length > 0;
  const chart = useCanvasTexture(1024, 1024, (ctx, w, h) => drawChart(ctx, w, h, stations, issued), [stations, issued]);
  const tilt = 0.32;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block p={[0, 0.45, 0]} s={[1.1, 0.9, 0.9]} m={MAT.wood} />
      <Block p={[0, 0.05, 0]} s={[1.0, 0.1, 0.8]} m={MAT.rubber} />
      {/* drawers */}
      {[0.25, 0.55].map((y) => (
        <group key={y}>
          <Block p={[0, y, 0.452]} s={[0.95, 0.24, 0.01]} m={MAT.consoleDark} />
          <Block p={[0, y, 0.465]} s={[0.18, 0.025, 0.02]} m={MAT.brass} />
        </group>
      ))}
      <group position={[0, 1.02, 0]} rotation={[-Math.PI / 2 + tilt, 0, 0]}>
        <Block p={[0, 0, -0.03]} s={[1.24, 1.0, 0.05]} m={MAT.wood} />
        <Block p={[0, -0.51, 0.0]} s={[1.24, 0.03, 0.04]} m={MAT.brassDark} />
        <mesh geometry={GEO.plane} scale={[0.92, 0.92, 1]} position={[0, 0.02, 0.0]}>
          <meshStandardMaterial map={chart} roughness={0.9} emissive="#ffffff" emissiveMap={chart} emissiveIntensity={0.35} />
        </mesh>
        {/* parallel rule + dividers as table props */}
        <Block p={[0.55, -0.1, 0.01]} s={[0.05, 0.7, 0.012]} m={MAT.chrome} />
      </group>
      {/* chart lamp on a gooseneck */}
      <Block p={[-0.5, 1.25, -0.42]} s={[0.025, 0.5, 0.025]} m={MAT.brassDark} />
      <mesh geometry={GEO.cyl} material={MAT.brass} position={[-0.42, 1.48, -0.34]} rotation={[0.9, 0, 0]} scale={[0.07, 0.1, 0.07]} />
    </group>
  );
}

// ------------------------------------------------------------ codebook card

export function Codebook({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("RADIO");
  const stations = useNavSlice((v) => v.radio.stations, [] as StationData);
  const issued = (mode === "active" || mode === "done") && stations.length > 0;
  const map = useCanvasTexture(1200, 800, (ctx, w, h) => drawCodebook(ctx, w, h, stations, issued), [stations, issued]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block p={[0, 0, -0.02]} s={[1.32, 0.9, 0.03]} m={MAT.wood} />
      <mesh geometry={GEO.plane} scale={[1.2, 0.8, 1]} position={[0, 0, 0.0]}>
        <meshStandardMaterial map={map} roughness={0.9} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.3} />
      </mesh>
      {/* clip at the top */}
      <Block p={[0, 0.42, 0.01]} s={[0.24, 0.07, 0.03]} m={MAT.brass} />
    </group>
  );
}
