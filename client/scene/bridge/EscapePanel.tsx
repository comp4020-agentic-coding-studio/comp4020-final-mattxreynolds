// Final escape — the door-ram panel on the aft bulkhead: band, LOW/OK/HIGH,
// door progress, the DOOR RELEASE hold button and the ABANDON SHIP lever.

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { send } from "../../net.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { drawDead, drawStandby, hazardStripes } from "./draw.ts";
import { Block, GEO, Lamp, MAT, Plate, PushButton, Screen } from "./kit.tsx";
import { drawEscape, type EscapeData } from "./screens.ts";
import { navView, nowS, useNav, useNavSlice, useStationMode } from "./state.ts";

const EMPTY: EscapeData = { band: [0, 0], status: "LOW", door: 0, held: false, youAbandon: false, partnerAbandon: false };

export function EscapePanel({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("ESCAPE");
  const raw = useNavSlice((v) => v.escape, EMPTY);
  // the door percentage is shown as an integer; redraw only when it changes
  const d = useMemo(() => ({ ...raw, door: Math.floor(raw.door) }), [raw]);
  const active = mode === "active";
  const doorOpen = d.door >= 100;
  const armed = useNav((v) => v.ship.armed, false);

  const map = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else if (mode === "standby") drawStandby(ctx, w, h, "DOOR RAMS", "STANDBY", "ESCAPE HATCH SEALED");
      else drawEscape(ctx, w, h, d);
    },
    [mode, d],
  );

  // the local hold state, so the button and prompt respond instantly
  const holding = useRef(false);
  const onHold = useCallback(
    (held: boolean) => {
      if (!active || doorOpen) {
        holding.current = false;
        return;
      }
      if (holding.current === held) return;
      holding.current = held;
      void send({ t: "holdDoor", held });
    },
    [active, doorOpen],
  );
  // if the phase ends or the door opens while held, release server-side
  useEffect(() => {
    if ((!active || doorOpen) && holding.current) {
      holding.current = false;
      if (navView()?.phase === "ESCAPE") void send({ t: "holdDoor", held: false });
    }
  }, [active, doorOpen]);

  const releasePrompt = !active
    ? "Door release — rams have no pressure yet"
    : doorOpen
      ? "Door release — DOOR OPEN"
      : d.held
        ? `Door release — HOLDING · pressure ${d.status}`
        : `Door release — HOLD E · pressure ${d.status}`;

  const pull = useRef(-10);
  const onAbandon = useCallback(() => {
    if (!active || !doorOpen) return;
    pull.current = nowS();
    void send({ t: "abandon" });
  }, [active, doorOpen]);
  const leverPrompt = !active
    ? "Abandon ship lever — not yet"
    : !doorOpen
      ? "Abandon ship lever — Door not open yet"
      : !armed && !d.youAbandon
        ? "Abandon ship lever — DAVITS NOT ARMED · arm them in the Comms Room first"
      : d.youAbandon
        ? "Abandon ship lever — PULLED · waiting for the Engine Room"
        : d.partnerAbandon
          ? "Abandon ship lever — ENGINE ROOM PULLED · E to pull NOW"
          : "Abandon ship lever — READY · E to pull (together with the Engine Room)";

  const stripes = useCanvasTexture(512, 512, (ctx, w, h) => hazardStripes(ctx, 0, 0, w, h, 48), []);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* backing plate on the bulkhead */}
      <Block p={[0, 1.45, -0.04]} s={[2.3, 1.6, 0.08]} m={MAT.consoleDark} />
      <mesh geometry={GEO.plane} position={[0, 1.45, -0.0]} scale={[2.36, 1.66, 1]} renderOrder={-1}>
        <meshStandardMaterial map={stripes} roughness={0.8} polygonOffset polygonOffsetFactor={1} />
      </mesh>
      <Block p={[0, 1.45, 0.005]} s={[2.18, 1.48, 0.02]} m={MAT.console} />
      <Screen map={map} width={1.2} height={0.75} position={[-0.4, 1.68, 0.03]} delay={0.7} flashOn={["doorOpen", "abandonPulled"]} />
      <Plate text="ESCAPE HATCH · DOOR RAMS" width={1.2} height={0.08} position={[-0.4, 2.16, 0.03]} border={PALETTE.hazardYellow} />

      {/* DOOR RELEASE (hold) */}
      <group position={[-0.4, 0.96, 0.03]}>
        <Interactable id={IDS.doorRelease} prompt={releasePrompt} onHold={onHold}>
          <PushButton color="#2f8f4e" r={0.085} lit={active && !doorOpen} held={d.held} />
        </Interactable>
        <Plate text={d.held ? "DOOR RELEASE · HOLDING" : "DOOR RELEASE · HOLD"} width={0.56} height={0.07} position={[0, -0.15, 0.0]} border={PALETTE.brass} />
      </group>

      {/* ABANDON SHIP lever */}
      <group position={[0.68, 1.45, 0.03]}>
        <mesh geometry={GEO.plane} position={[0, 0, 0.002]} scale={[0.66, 1.3, 1]}>
          <meshStandardMaterial map={stripes} roughness={0.7} />
        </mesh>
        <Block p={[0, 0, 0.01]} s={[0.5, 1.1, 0.02]} m={MAT.enamel} />
        <Plate text={"ABANDON\nSHIP"} width={0.42} height={0.17} position={[0, 0.46, 0.025]} fg={PALETTE.lampRed} border={PALETTE.lampRed} />
        <Interactable id={IDS.abandonNavigator} prompt={leverPrompt} onUse={onAbandon}>
          <Lever pulled={d.youAbandon} pullAt={pull} armed={active && doorOpen} />
        </Interactable>
        <group position={[0, -0.36, 0.025]}>
          <Lamp on={active && d.youAbandon} color={PALETTE.lampAmber} r={0.03} position={[-0.15, 0.02, 0]} blink />
          <Plate text={d.youAbandon ? "YOU · PULLED" : "YOU"} width={0.2} height={0.05} position={[-0.15, -0.06, 0]} />
          <Lamp on={active && d.partnerAbandon} color={PALETTE.lampAmber} r={0.03} position={[0.12, 0.02, 0]} blink />
          <Plate text={d.partnerAbandon ? "ENGINE · PULLED" : "ENGINE ROOM"} width={0.22} height={0.05} position={[0.12, -0.06, 0]} />
        </group>
        <Plate text={doorOpen ? "PULL TOGETHER" : "DOOR NOT OPEN"} width={0.42} height={0.06} position={[0, -0.5, 0.025]} fg={doorOpen ? PALETTE.lampAmber : "#9a9586"} />
      </group>

      {/* davits interlock: ABANDON is refused until the Comms Room arms them */}
      <group position={[-0.4, 0.72, 0.03]}>
        <Lamp on={active && armed} r={0.028} position={[-0.47, 0, 0]} />
        <Plate
          text={armed ? "DAVITS: ARMED" : "DAVITS: NOT ARMED · ARM IN COMMS"}
          width={0.86}
          height={0.07}
          position={[0.06, 0, 0]}
          fg={armed ? PALETTE.lampGreen : PALETTE.lampAmber}
          border={armed ? PALETTE.lampGreen : PALETTE.hazardYellow}
        />
      </group>
    </group>
  );
}

function Lever({ pulled, pullAt, armed }: { pulled: boolean; pullAt: { current: number }; armed: boolean }) {
  const arm = useRef<Group>(null);
  const live = useRef(pulled);
  live.current = pulled;
  useFrame(() => {
    if (!arm.current) return;
    const local = nowS() - pullAt.current < 0.6;
    const target = live.current || local ? -0.9 : 0.6;
    arm.current.rotation.x += (target - arm.current.rotation.x) * 0.25;
  });
  return (
    <group position={[0, 0.06, 0.04]}>
      <Block p={[0, 0, 0]} s={[0.16, 0.12, 0.06]} m={MAT.bezel} />
      <group ref={arm} rotation={[0.6, 0, 0]}>
        <mesh geometry={GEO.cyl12} material={MAT.chrome} position={[0, 0.14, 0]} scale={[0.016, 0.28, 0.016]} />
        <mesh geometry={GEO.sphere} position={[0, 0.29, 0]} scale={[0.045, 0.045, 0.045]}>
          <meshStandardMaterial color={armed ? "#d8301f" : "#5a2a24"} emissive="#d8301f" emissiveIntensity={armed ? 0.5 : 0} />
        </mesh>
      </group>
    </group>
  );
}
