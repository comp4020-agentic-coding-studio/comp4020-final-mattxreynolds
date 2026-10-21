// RADIO station: the transmitter cabinet. Resonance meter + LOCK lamp and the
// COUPLE lever (3a); the PULSE lamp blinking the answering station's rhythm,
// the antenna rotator compass with two crank buttons, and the CONTACT lamp (3b).

import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { Group, MeshStandardMaterial } from "three";
import { BEARINGS } from "../../../shared/glyphs.ts";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable, useLatched } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Dial, Lamp, Lever, type DialSpec } from "../parts.tsx";
import { kicks } from "./Effects.tsx";
import { At, B, CanvasPlane, C, ev, G, M, Plate, STAGE, STENCIL, useEV, useStage } from "./kit.tsx";
import { AT } from "./layout.ts";
import { pulseAt } from "./pulse.ts";

const RES_SPEC: DialSpec = {
  min: 0,
  max: 1,
  sweep: Math.PI * 0.9,
  ticks: [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => ({ v, label: String(Math.round(v * 10)) })),
  minor: 0.05,
  title: "RESONANCE",
  subtitle: "COLD ← → HOT",
  zones: [{ from: 0.9, to: 1, color: "rgba(57,160,90,0.55)" }],
};

/** Compass rose face: big letters, N at top, clockwise. */
function drawRose(ctx: CanvasRenderingContext2D, W: number): void {
  const c = W / 2;
  const R = W * 0.47;
  ctx.fillStyle = PALETTE.dialFace;
  ctx.beginPath();
  ctx.arc(c, c, R + W * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.dialInk;
  ctx.lineWidth = W * 0.008;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  BEARINGS.forEach((b, i) => {
    const a = (i / 8) * Math.PI * 2;
    const major = i % 2 === 0;
    ctx.fillStyle = PALETTE.dialInk;
    ctx.font = `900 ${W * (major ? 0.13 : 0.085)}px ${STENCIL}`;
    const r = R * (major ? 0.74 : 0.76);
    ctx.fillText(b, c + Math.sin(a) * r, c - Math.cos(a) * r);
    ctx.lineWidth = W * 0.014;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * R * 0.95, c - Math.cos(a) * R * 0.95);
    ctx.lineTo(c + Math.sin(a) * R * 0.86, c - Math.cos(a) * R * 0.86);
    ctx.stroke();
  });
  // star points in the middle
  ctx.fillStyle = "rgba(27,27,27,0.12)";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * R * 0.5, c - Math.cos(a) * R * 0.5);
    ctx.lineTo(c + Math.sin(a + 0.4) * R * 0.12, c - Math.cos(a + 0.4) * R * 0.12);
    ctx.lineTo(c + Math.sin(a - 0.4) * R * 0.12, c - Math.cos(a - 0.4) * R * 0.12);
    ctx.fill();
  }
  ctx.font = `900 ${W * 0.045}px ${STENCIL}`;
  ctx.fillStyle = PALETTE.dialInk;
  ctx.fillText("ANTENNA", c, c + R * 0.32);
}

function PulseLamp() {
  const m = M();
  const mat = useMemo(() => new MeshStandardMaterial({ color: "#3a3a30", emissive: "#fff2b0", emissiveIntensity: 0, roughness: 0.25 }), []);
  useFrame(() => {
    const p = ev()?.radio.pulse ?? null;
    const on = p ? pulseAt(p, performance.now()) >= 0 : false;
    mat.emissiveIntensity = on ? 3.2 : 0;
    mat.color.set(on ? "#fff2b0" : "#3a3a30");
  });
  return (
    <group>
      <mesh geometry={G().sphere} material={mat} scale={[0.17, 0.17, 0.12]} />
      <mesh geometry={G().ring} material={m.brass} scale={[0.36, 0.36, 0.6]} />
      {/* cage bars */}
      {[-0.05, 0.05].map((x) => (
        <B key={x} p={[x, 0, 0.065]} s={[0.012, 0.17, 0.012]} m={m.brassDark} />
      ))}
    </group>
  );
}

function Pointer() {
  const ref = useRef<Group>(null);
  const m = M();
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = -((ev()?.radio.antenna ?? 0) / 8) * Math.PI * 2;
    // shortest way round
    let d = target - g.rotation.z;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    g.rotation.z += d * Math.min(1, dt * 6);
  });
  return (
    <group ref={ref} position={[0, 0, 0.02]}>
      <mesh geometry={G().box} material={m.valveRed} position={[0, 0.1, 0]} scale={[0.035, 0.2, 0.012]} />
      <mesh geometry={G().box} material={m.valveRed} position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]} scale={[0.05, 0.05, 0.012]} />
      <mesh geometry={G().box} material={m.enamel} position={[0, -0.05, 0]} scale={[0.05, 0.1, 0.012]} />
    </group>
  );
}

function CrankButton({ id, dir, live, antenna, stage }: { id: string; dir: 1 | -1; live: boolean; antenna: number; stage: number }) {
  const m = M();
  const latch = useLatched(antenna);
  const use = useCallback(() => {
    const next = (latch.get() + (dir === 1 ? 1 : 7)) % 8;
    latch.set(next);
    void send({ t: "setAntenna", bearing: next }).then((a) => a.ok || latch.clear());
  }, [dir, latch]);
  const way = dir === 1 ? "clockwise" : "anticlockwise";
  const at = BEARINGS[antenna];
  const prompt =
    stage < STAGE.RADIO
      ? `Antenna ${way} — no power to the rotator yet`
      : stage > STAGE.RADIO
        ? `Antenna — pointing ${at} · contact made`
        : `Antenna — pointing ${at} · E to rotate ${way}`;
  return (
    <Interactable id={id} prompt={prompt} onUse={live ? use : undefined}>
      <C p={[0, 0, 0.03]} d={0.2} l={0.06} m={m.enamel} r={[Math.PI / 2, 0, 0]} />
      <C p={[0, 0, 0.07]} d={0.16} l={0.05} m={live ? m.valveRed : m.lampOff} r={[Math.PI / 2, 0, 0]} />
      <Plate text={dir === 1 ? "↻" : "↺"} w={0.1} h={0.1} position={[0, 0, 0.1]} bg="#8d241e" glow={0.8} />
      <Plate text={dir === 1 ? "CW" : "ACW"} w={0.14} h={0.06} position={[0, -0.17, 0.02]} glow={0.6} />
    </Interactable>
  );
}

export function Transmitter() {
  const m = M();
  const { stage } = useStage();
  const live = stage === STAGE.RADIO;
  const coupled = useEV((v) => v.radio.coupled, false);
  const lock = useEV((v) => v.radio.lock, false);
  const contact = useEV((v) => v.radio.contact, false);
  const antenna = useEV((v) => v.radio.antenna, 0);
  const pulsing = useEV((v) => v.radio.pulse !== null, false);
  const couple = useCallback(() => void send({ t: "couple" }), []);
  const couplerPrompt =
    stage < STAGE.RADIO
      ? "Transmitter coupler — no power yet"
      : coupled
        ? "Transmitter coupler — ENGAGED"
        : live
          ? `Transmitter coupler — DISENGAGED${lock ? " · LOCK lit" : ""} · E to couple`
          : "Transmitter coupler — DISENGAGED";
  const humMat = useMemo(() => new MeshStandardMaterial({ color: "#20302a", emissive: "#5cffb0", emissiveIntensity: 0, roughness: 0.4 }), []);
  useFrame((_, dt) => {
    kicks.hum = Math.max(0, kicks.hum - dt * 0.5);
    const v = ev();
    const base = v?.radio.coupled ? 0.5 + Math.sin(performance.now() / 300) * 0.1 : 0;
    humMat.emissiveIntensity = base + kicks.hum * 2 + kicks.arc * 3;
    humMat.emissive.set(kicks.arc > 0.05 ? "#bfe0ff" : "#5cffb0");
  });

  return (
    <At p={AT.transmitter}>
      {/* cabinet */}
      <B p={[0, 1.15, 0.3]} s={[1.9, 2.3, 0.6]} m={m.cabinet} />
      <B p={[0, 2.33, 0.3]} s={[1.95, 0.06, 0.64]} m={m.steel} />
      <B p={[0, 0.06, 0.3]} s={[1.95, 0.12, 0.64]} m={m.pipeDark} />
      <Plate text="W/T TRANSMITTER" w={1.2} h={0.15} position={[0, 2.18, 0.605]} glow={0.7} />
      {/* valve-tube window: glows with the carrier hum */}
      <B p={[0, 1.92, 0.605]} s={[1.0, 0.18, 0.01]} m={humMat} />
      {[-0.36, -0.12, 0.12, 0.36].map((x) => (
        <C key={x} p={[x, 1.92, 0.612]} d={0.06} l={0.16} m={m.brassDark} />
      ))}

      {/* ---- left column: carrier (3a) */}
      <group position={[-0.5, 0, 0.61]}>
        <Dial position={[0, 1.52, 0.01]} diameter={0.48} spec={RES_SPEC} specKey="r" value={() => ev()?.radio.resonance ?? 0} />
        <Lamp position={[-0.12, 1.17, 0.02]} color={PALETTE.lampGreen} size={0.07} level={() => (ev()?.radio.lock ? 1 : 0)} />
        <Plate text="LOCK" w={0.2} h={0.09} position={[0.08, 1.17, 0.01]} bg={lock ? "#1d5a33" : PALETTE.plateBg} glow={lock ? 1 : 0.4} />
        <Interactable id={IDS.coupleLever} prompt={couplerPrompt} onUse={live && !coupled ? couple : undefined} position={[0, 0.82, 0.02]}>
          <B p={[0, 0, 0]} s={[0.34, 0.36, 0.04]} m={m.enamel} />
          {/* up = disengaged, thrown down = engaged */}
          <Lever position={[0, 0, 0.04]} angle={coupled ? Math.PI - 0.6 : 0.5} length={0.22} thickness={0.04} knob={PALETTE.brass} />
        </Interactable>
        <Plate text={coupled ? "COUPLED" : "COUPLE ▼"} w={0.34} h={0.08} position={[0, 1.055, 0.01]} bg={coupled ? "#1d5a33" : PALETTE.plateBg} glow={0.8} />
      </group>

      {/* ---- right column: pulse lamp, antenna, contact (3b) */}
      <group position={[0.42, 0, 0.61]}>
        <group position={[-0.2, 1.53, 0.04]}>
          <PulseLamp />
        </group>
        <Plate text={pulsing ? "PULSE\nRECEIVING" : "PULSE"} w={0.32} h={0.15} position={[0.2, 1.53, 0.01]} glow={0.6} />
        <group position={[0, 1.0, 0.01]}>
          <mesh geometry={G().ring} material={m.brass} scale={[0.5, 0.5, 0.8]} />
          <CanvasPlane w={0.48} h={0.48} px={512} position={[0, 0, 0]} draw={(ctx, W) => drawRose(ctx, W)} deps={[]} glow={0.4} transparent />
          <Pointer />
        </group>
        <group position={[-0.36, 0.66, 0.01]}>
          <CrankButton id={IDS.antennaLeft} dir={-1} live={live && !contact} antenna={antenna} stage={stage} />
        </group>
        <group position={[0.36, 0.66, 0.01]}>
          <CrankButton id={IDS.antennaRight} dir={1} live={live && !contact} antenna={antenna} stage={stage} />
        </group>
        <Plate text={`AIM ${BEARINGS[antenna]}`} w={0.3} h={0.1} position={[0, 0.66, 0.01]} glow={0.7} />
        <Lamp position={[-0.15, 0.36, 0.02]} color={PALETTE.lampGreen} size={0.07} level={() => {
          const v = ev();
          if (kicks.contact > 0) return Math.sin(performance.now() / 70) > 0 ? 1 : 0.2;
          return v?.radio.contact ? 1 : 0;
        }} />
        <Plate text={contact ? "CONTACT" : "NO CONTACT"} w={0.36} h={0.09} position={[0.08, 0.36, 0.01]} bg={contact ? "#1d5a33" : PALETTE.plateBg} glow={contact ? 1 : 0.4} />
      </group>
      {/* antenna feed up through the deckhead */}
      <C p={[0.8, 2.7, 0.3]} d={0.08} l={0.7} m={m.brassDark} />
    </At>
  );
}
