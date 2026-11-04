// ESCAPE station on the east (far) bulkhead: hydraulic gauge (0..100, no band
// marks), hand pump (stroke animation on each use), the watertight escape
// door that slides open with view.escape.door, and the hazard-striped
// ABANDON SHIP lever with YOU / BRIDGE lamps.
// Authored facing +Z; mounted on the east wall so local +x = world +z.

import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { ExtrudeGeometry, Group, MeshBasicMaterial, MeshStandardMaterial, PointLight, AdditiveBlending } from "three";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Dial, Lamp, Lever, type DialSpec } from "../parts.tsx";
import { At, B, C, ev, G, M, Pipe, Plate, STAGE, useEV, useStage } from "./kit.tsx";
import { AT, ESC, FACE } from "./layout.ts";
import { roundRect } from "./Shell.tsx";

const HYD_SPEC: DialSpec = {
  min: 0,
  max: 100,
  ticks: Array.from({ length: 11 }, (_, i) => ({ v: i * 10, label: String(i * 10) })),
  minor: 5,
  title: "HYDRAULIC",
  subtitle: "DOOR RAMS",
};

/** Animation state shared with the fx handler: last stroke time. */
export const pumpAnim = { strokeAt: 0 };

function HandPump() {
  const m = M();
  const { stage } = useStage();
  const live = stage === STAGE.ESCAPE;
  const handle = useRef<Group>(null);
  const stroke = useCallback(() => {
    pumpAnim.strokeAt = performance.now();
    void send({ t: "pumpStroke" });
  }, []);
  useFrame(() => {
    const g = handle.current;
    if (!g) return;
    const k = (performance.now() - pumpAnim.strokeAt) / 350;
    // down fast, back up slower
    const a = k < 0 || k > 1 ? 0 : k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
    g.rotation.x = -0.55 + a * 1.0; // rest raised; stroke pushes the handle down
  });
  const prompt =
    stage < STAGE.ESCAPE ? "Hand pump — rams isolated" : stage > STAGE.ESCAPE ? "Hand pump" : "Hand pump — E to stroke (repeat to build pressure)";
  return (
    <group>
      <C p={[0, 0.5, 0]} d={0.22} l={1.0} m={m.green} />
      <C p={[0, 1.02, 0]} d={0.14} l={0.06} m={m.brass} />
      <B p={[0, 0.03, 0]} s={[0.4, 0.06, 0.4]} m={m.pipeDark} />
      <Interactable id={IDS.handPump} prompt={prompt} onUse={live ? stroke : undefined} position={[0, 1.05, 0]}>
        <group ref={handle}>
          <B p={[0, 0, 0.3]} s={[0.05, 0.05, 0.65]} m={m.steel} />
          <C p={[0, 0, 0.66]} d={0.07} l={0.26} m={m.rubber} r={[0, 0, Math.PI / 2]} />
          {/* fat invisible grip so it's easy to aim at */}
          <mesh geometry={G().box} position={[0, 0, 0.45]} scale={[0.3, 0.2, 0.5]}>
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </Interactable>
      <Pipe a={[0, 0.9, 0]} b={[0, 0.9, -0.5]} d={0.06} m={m.brassDark} />
    </group>
  );
}

function Door() {
  const m = M();
  const slide = useRef<Group>(null);
  const wheel = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const cur = useRef(0);
  const leaf = useMemo(
    () => new ExtrudeGeometry(roundRect(ESC.doorW + 0.1, ESC.doorH + 0.08, 0.26, 0.08), { depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 8 }),
    [],
  );
  const glowMat = useMemo(() => new MeshBasicMaterial({ color: "#fff0cc", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), []);
  const skyMat = useMemo(() => new MeshStandardMaterial({ color: "#7d97a3", emissive: "#b9ccd6", emissiveIntensity: 0.45 }), []);
  useFrame((_, dt) => {
    const v = ev();
    const target = (v?.escape.door ?? 0) / 100;
    const ended = v?.phase === "SURVIVED";
    const t = ended ? 1 : target;
    cur.current += (t - cur.current) * Math.min(1, dt * 2.5);
    const k = cur.current;
    // first 15 % unlocks (wheel spins, leaf backs out of the frame), then it
    // slides sideways into the pocket behind the bulkhead
    const unlock = Math.min(1, k / 0.15);
    const slideK = Math.max(0, (k - 0.15) / 0.85);
    if (wheel.current) wheel.current.rotation.z = -unlock * Math.PI * 2;
    if (slide.current) {
      slide.current.position.x = slideK * (ESC.doorW + 0.3);
      slide.current.position.z = -unlock * 0.42;
    }
    if (light.current) light.current.intensity = k * 9;
    glowMat.opacity = k * 0.25;
  });

  return (
    <group>
      {/* what's beyond: a bright companionway */}
      <mesh position={[0, ESC.doorH / 2 + 0.12, -0.6]} material={skyMat}>
        <planeGeometry args={[ESC.doorW + 0.4, ESC.doorH + 0.4]} />
      </mesh>
      <B p={[0, 0.06, -0.3]} s={[ESC.doorW, 0.12, 0.6]} m={m.deck} />
      {/* light spilling into the room */}
      <mesh position={[0, ESC.doorH / 2 + 0.12, 0.02]} material={glowMat} raycast={() => null}>
        <planeGeometry args={[ESC.doorW, ESC.doorH]} />
      </mesh>
      <pointLight ref={light} position={[0, 1.6, 0.6]} color="#fff2d6" intensity={0} distance={8} decay={1.3} />
      {/* door leaf */}
      <group ref={slide} position={[0, 0, 0]}>
        <mesh geometry={leaf} material={m.cabinet} />
        {/* dogs (clamps) around the edge */}
        {[
          [-ESC.doorW / 2 - 0.02, 0.6],
          [-ESC.doorW / 2 - 0.02, 1.7],
          [ESC.doorW / 2 + 0.02, 0.6],
          [ESC.doorW / 2 + 0.02, 1.7],
        ].map(([x, y], i) => (
          <B key={i} p={[x, y, 0.13]} s={[0.12, 0.06, 0.06]} m={m.steel} />
        ))}
        <group ref={wheel} position={[0, 1.25, 0.16]}>
          <mesh geometry={G().torus} material={m.valveRed} scale={[0.5, 0.5, 1]} />
          {[0, 1, 2].map((k) => (
            <B key={k} p={[0, 0, 0]} s={[0.5, 0.03, 0.03]} m={m.valveRed} r={[0, 0, (k * Math.PI) / 3]} />
          ))}
          <C p={[0, 0, 0]} d={0.1} l={0.06} m={m.brass} r={[Math.PI / 2, 0, 0]} />
        </group>
        <Plate text="WATERTIGHT DOOR" w={0.8} h={0.13} position={[0, 1.8, 0.125]} glow={0.6} />
        <Plate text="ESCAPE ▲ BOAT DECK" w={0.8} h={0.1} position={[0, 0.55, 0.125]} bg="#1d5a33" glow={0.7} />
      </group>
    </group>
  );
}

function AbandonLever() {
  const m = M();
  const { stage } = useStage();
  const door = useEV((v) => v.escape.door, 0);
  const you = useEV((v) => v.escape.youAbandon, false);
  const partner = useEV((v) => v.escape.partnerAbandon, false);
  const armed = useEV((v) => v.ship.armed, false);
  const live = stage === STAGE.ESCAPE;
  const pull = useCallback(() => void send({ t: "abandon" }), []);
  const ready = door >= 100;
  let prompt: string;
  if (stage < STAGE.ESCAPE) prompt = "Abandon ship lever — not yet";
  else if (stage > STAGE.ESCAPE) prompt = "Abandon ship lever — PULLED";
  else if (!ready) prompt = `Abandon ship lever — door ${Math.round(door)}% open · door must be fully open`;
  else if (!armed) prompt = "Abandon ship lever — DAVITS NOT ARMED · the Bridge arms them";
  else if (you) prompt = `Abandon ship lever — PULLED${partner ? "" : " · waiting for the Bridge"}`;
  else prompt = `Abandon ship lever — READY${partner ? " · Bridge has pulled — NOW" : ""} · E to pull`;
  // with the door open but the davits unarmed the press still goes through,
  // so the server's davits-not-armed refusal is toasted
  const doIt = live && ready;

  return (
    <group>
      <B p={[0, 1.25, 0.04]} s={[0.6, 1.3, 0.08]} m={m.hazard} />
      <B p={[0, 1.25, 0.09]} s={[0.48, 1.15, 0.03]} m={m.panel} />
      <Plate text={"ABANDON\nSHIP"} w={0.42} h={0.22} position={[0, 1.68, 0.11]} bg="#6a1810" glow={0.9} />
      <Interactable id={IDS.abandonEngineer} prompt={prompt} onUse={doIt ? pull : undefined} position={[0, 1.2, 0.12]}>
        <B p={[0, 0, 0]} s={[0.3, 0.4, 0.04]} m={m.enamel} />
        <Lever position={[0, 0.0, 0.04]} angle={you ? Math.PI - 0.6 : 0.4} length={0.28} thickness={0.05} armMaterial={m.hazard} knob={PALETTE.valveRed} speed={14} />
      </Interactable>
      <Lamp position={[-0.13, 0.88, 0.12]} color={PALETTE.lampAmber} size={0.06} level={() => (ev()?.escape.youAbandon ? 1 : 0)} />
      <Plate text="YOU" w={0.18} h={0.07} position={[-0.13, 0.78, 0.11]} glow={0.6} />
      <Lamp position={[0.13, 0.88, 0.12]} color={PALETTE.lampAmber} size={0.06} level={() => (ev()?.escape.partnerAbandon ? 1 : 0)} />
      <Plate text="BRIDGE" w={0.2} h={0.07} position={[0.13, 0.78, 0.11]} glow={0.6} />
      {/* davits: the Bridge's job; lit (and labelled) once armed */}
      <B p={[0, 2.12, 0.03]} s={[0.6, 0.22, 0.06]} m={m.panel} />
      <Lamp position={[-0.21, 2.12, 0.07]} color={PALETTE.lampGreen} size={0.06} level={() => (ev()?.ship.armed ? 1 : 0)} />
      <Plate text={armed ? "DAVITS ARMED" : "DAVITS SAFE"} w={0.42} h={0.13} position={[0.06, 2.12, 0.065]} bg={armed ? "#1d5a33" : PALETTE.plateBg} glow={armed ? 1 : 0.5} />
      <Plate text="ARMED FROM BRIDGE" w={0.5} h={0.06} position={[0, 1.96, 0.065]} glow={0.45} />
      <Plate text={!ready ? "DOOR SHUT" : armed ? "PULL TOGETHER" : "WAIT: DAVITS"} w={0.44} h={0.08} position={[0, 0.66, 0.11]} bg={ready ? "#3a2a10" : PALETTE.plateBg} glow={0.6} />
    </group>
  );
}

export function EscapeWall() {
  const m = M();
  return (
    <At p={AT.escapeWall} r={[0, FACE.east, 0]}>
      <Door />
      {/* hydraulic station left of the door */}
      <group position={[ESC.pumpX, 0, 0]}>
        <B p={[0, 1.55, 0.04]} s={[0.75, 0.9, 0.08]} m={m.panel} />
        <Dial position={[0, 1.62, 0.1]} diameter={0.56} spec={HYD_SPEC} specKey="h" value={() => ev()?.escape.pressure ?? 0} faceGlow={0.12} />
        <Plate text="DOOR RAM PRESSURE" w={0.66} h={0.09} position={[0, 1.2, 0.09]} glow={0.6} />
        <Plate text="HAND PUMP ▼ STROKE" w={0.6} h={0.08} position={[0, 0.72, 0.09]} border={PALETTE.hazardYellow} glow={0.6} />
        <group position={[0.55, 0, ESC.pumpZ]}>
          <HandPump />
        </group>
        <Pipe a={[0.3, 0.9, 0.06]} b={[0.85, 0.9, 0.06]} d={0.05} m={m.brassDark} />
      </group>
      {/* abandon lever right of the door */}
      <group position={[ESC.abandonX, 0, 0]}>
        <AbandonLever />
      </group>
      {/* hazard frame on the deck in front of the door */}
      <B p={[0, 0.005, 0.5]} s={[ESC.doorW + 0.3, 0.01, 0.12]} m={m.hazard} />
    </At>
  );
}
