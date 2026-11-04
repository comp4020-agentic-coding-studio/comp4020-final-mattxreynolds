// Comms Room (Act III on): a compact room off the Bridge's starboard bulkhead,
// sealed until the distress phase begins. It holds the distribution panel
// (circuit draws + LIGHTS / RADIO / EVAC switches), the evac accumulator and
// ARM DAVITS on the far wall, and the coast-station call panel.
//
// Plan (x right, z aft; the room spans x 5 → 10, z −3 → 3):
//
//   z=-3      [ DISTRIBUTION · 3 switches ]
//   x=5 door                                   [ EVAC + DAVITS ]  x=10
//   (z 0–1.2)
//   z=+3      [ COAST STATION CALL · ANSWER ]

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type Group, MeshBasicMaterial, type PointLight, RepeatWrapping } from "three";
import { FINALE } from "../../../shared/config.ts";
import { CIRCUIT_LABEL, CIRCUITS, INTENT_RULES, type Circuit, type Phase, roomOpen } from "../../../shared/protocol.ts";
import { send } from "../../net.ts";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { IDS } from "../ids.ts";
import { Interactable, useLatched } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { drawDead, hazardStripes } from "./draw.ts";
import { Block, ConsoleBody, DESK, GEO, Lamp, MAT, Plate, PushButton, RISER_Z, Screen, Slope, SLOPE_AT, usePress } from "./kit.tsx";
import { CeilingLamp, COMMS_DOOR, DeckTexture, DOOR_H, lightLevel, ROOM } from "./Room.tsx";
import {
  type CallData,
  drawCall,
  drawDistribution,
  drawEmergencyCard,
  drawEvac,
  drawMuster,
  drawRoster,
  drawShipBoard,
  type DistData,
  type EvacData,
} from "./commsScreens.ts";
import { navView, nowS, useNav, useNavSlice } from "./state.ts";

/** Room extents (inner faces) and furniture placement, shared with BRIDGE_LAYOUT. */
export const COMMS = {
  x0: 5.0,
  x1: 9.88,
  z0: -2.88,
  z1: 2.88,
  dist: { x: 7.3, z: -2.48, w: 2.4 },
  call: { x: 7.3, z: 2.48, w: 2.2 },
  evac: { x: 9.74, z: 0, w: 2.3, d: 0.28 },
} as const;
const WALL = 0.12;
const DESK_D = DESK.d;
const H = ROOM.h;

/** The Comms Room door is open (read every frame by the collision layout). */
export const commsOpen = (): boolean => {
  const v = navView();
  return !!v && roomOpen("COMMS", v.phase, v.outcome?.phaseReached);
};

const CIRCUIT_PHASES = INTENT_RULES.setCircuit.phases;
type Stage = "before" | "live" | "after";
/** Act IV systems (accumulator, calls): not yet / live / voyage over. */
const stageOf = (phase: Phase): Stage =>
  phase === "CASCADE" || phase === "ESCAPE" ? "live" : phase === "SURVIVED" || phase === "LOST" ? "after" : "before";

// ------------------------------------------------------------ the door (Bridge side)

/** The watertight door in the Bridge's starboard bulkhead, its stencil and
 * the SEALED / OPEN lamp. Mounted with the Bridge shell so the doorway is
 * never an empty hole. Slides aft→fwd into a pocket on the Comms side. */
export function CommsDoor() {
  const leaf = useRef<Group>(null);
  const open = useNav((v) => roomOpen("COMMS", v.phase, v.outcome?.phaseReached), false);
  const [z0, z1] = COMMS_DOOR;
  const w = z1 - z0;
  const cz = (z0 + z1) / 2;
  const x = ROOM.w / 2;
  useFrame((_, dt) => {
    if (!leaf.current) return;
    const target = commsOpen() ? -w - 0.05 : 0;
    const reduced = useStore.getState().reducedMotion;
    const z = leaf.current.position.z;
    leaf.current.position.z = reduced ? target : z + Math.sign(target - z) * Math.min(Math.abs(target - z), dt * 0.9);
  });
  return (
    <group>
      {/* the leaf, on the Comms side of the bulkhead */}
      <group ref={leaf}>
        <Block p={[x + 0.035, DOOR_H / 2, cz]} s={[0.05, DOOR_H + 0.04, w + 0.1]} m={MAT.bulkheadDark} />
        {/* dogs and a handwheel on the Bridge face */}
        <mesh position={[x - 0.0, 1.15, cz]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.16, 0.02, 8, 24]} />
          <primitive object={MAT.brass} attach="material" />
        </mesh>
        {[-0.45, 0.45].map((dz) => (
          <Block key={dz} p={[x + 0.0, 1.15, cz + dz]} s={[0.04, 0.12, 0.06]} m={MAT.brassDark} />
        ))}
        <Plate text="COMMS" width={0.5} height={0.12} position={[x + 0.0, 1.6, cz]} rotation={[0, -Math.PI / 2, 0]} border={PALETTE.brassDark} />
      </group>
      {/* frame */}
      <Block p={[x - 0.13, DOOR_H + 0.04, cz]} s={[0.04, 0.08, w + 0.16]} m={MAT.brassDark} />
      {[z0 - 0.04, z1 + 0.04].map((z) => (
        <Block key={z} p={[x - 0.13, DOOR_H / 2, z]} s={[0.04, DOOR_H, 0.08]} m={MAT.brassDark} />
      ))}
      <Block p={[x - 0.06, 0.02, cz]} s={[0.16, 0.04, w]} m={MAT.brassDark} />
      {/* stencil above, and the state lamp + words beside (never colour alone) */}
      <Plate text="COMMS / DISTRIBUTION" width={1.3} height={0.16} position={[x - 0.125, 2.4, cz]} rotation={[0, -Math.PI / 2, 0]} border={PALETTE.brass} />
      <group position={[x - 0.125, 1.55, z1 + 0.42]} rotation={[0, -Math.PI / 2, 0]}>
        <Lamp on color={open ? PALETTE.lampGreen : PALETTE.lampAmber} r={0.04} position={[0, 0.12, 0]} />
        <Plate text={open ? "OPEN" : "SEALED"} width={0.4} height={0.09} position={[0, -0.0, 0.01]} fg={open ? PALETTE.lampGreen : PALETTE.lampAmber} />
        {!open && <Plate text={"OPENS ON\nDISTRESS"} width={0.4} height={0.14} position={[0, -0.14, 0.01]} fg="#9a9586" />}
      </group>
    </group>
  );
}

// ------------------------------------------------------------ the room

export function CommsRoom() {
  return (
    <group>
      <CommsShell />
      <DistributionPanel position={[COMMS.dist.x, 0, COMMS.dist.z]} />
      <CallPanel position={[COMMS.call.x, 0, COMMS.call.z]} rotationY={Math.PI} />
      <EvacPanel position={[COMMS.x1, 0, COMMS.evac.z]} rotationY={-Math.PI / 2} />
      <Notices />
    </group>
  );
}

function CommsShell() {
  const deck = DeckTexture();
  const w = COMMS.x1 - COMMS.x0 + WALL;
  const d = COMMS.z1 - COMMS.z0;
  deck.wrapS = deck.wrapT = RepeatWrapping;
  deck.repeat.set(w / 1.2, d / 1.2);
  const cx = (COMMS.x0 + COMMS.x1) / 2;
  const glow = useMemo(() => new MeshBasicMaterial({ color: PALETTE.workLight, toneMapped: false }), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const light = useRef<PointLight>(null);
  const smooth = useRef(0.5);
  useFrame((_, dt) => {
    // follows the Bridge's lighting; dark until the room is unsealed
    const { work, emergency } = lightLevel();
    const target = commsOpen() ? work : 0.15;
    smooth.current += (target - smooth.current) * Math.min(1, dt * 2);
    if (light.current) {
      light.current.intensity = 6 * smooth.current;
      light.current.color.set(emergency ? "#ffb0a0" : PALETTE.workLight);
    }
    glow.color.set(PALETTE.workLight).multiplyScalar(0.15 + 0.85 * smooth.current);
  });
  const wallX = (z0: number, z1: number, x: number) => {
    const zc = (z0 + z1) / 2;
    return (
      <group>
        <Block p={[x, 0.45, zc]} s={[WALL, 0.9, z1 - z0]} m={MAT.bulkheadLow} />
        <Block p={[x, (0.9 + H) / 2, zc]} s={[WALL, H - 0.9, z1 - z0]} m={MAT.bulkhead} />
      </group>
    );
  };
  const wallZ = (z: number) => (
    <group>
      <Block p={[cx + WALL / 2, 0.45, z]} s={[w + WALL, 0.9, WALL]} m={MAT.bulkheadLow} />
      <Block p={[cx + WALL / 2, (0.9 + H) / 2, z]} s={[w + WALL, H - 0.9, WALL]} m={MAT.bulkhead} />
    </group>
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, 0]} geometry={GEO.plane} scale={[w, d, 1]}>
        <meshStandardMaterial map={deck} roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, H, 0]} geometry={GEO.plane} scale={[w, d, 1]} material={MAT.ceiling} />
      {wallZ(COMMS.z0 - WALL / 2)}
      {wallZ(COMMS.z1 + WALL / 2)}
      {wallX(COMMS.z0 - WALL, COMMS.z1 + WALL, COMMS.x1 + WALL / 2)}
      {/* cable trays and a beam */}
      <Block p={[cx, H - 0.06, 0]} s={[w, 0.12, 0.18]} m={MAT.bulkheadDark} />
      <Block p={[cx, H - 0.25, COMMS.z0 + 0.25]} s={[w, 0.04, 0.3]} m={MAT.pipe} />
      <Block p={[cx, H - 0.25, COMMS.z1 - 0.25]} s={[w, 0.04, 0.3]} m={MAT.pipe} />
      <Block p={[cx, 0.06, COMMS.z0 + 0.02]} s={[w, 0.12, 0.04]} m={MAT.bulkheadDark} />
      <Block p={[cx, 0.06, COMMS.z1 - 0.02]} s={[w, 0.12, 0.04]} m={MAT.bulkheadDark} />
      <pointLight ref={light} position={[cx, H - 0.4, 0]} color={PALETTE.workLight} intensity={3} distance={8} decay={1.4} />
      <CeilingLamp position={[cx, H - 0.2, 0]} glow={glow} />
      <Plate text="BRIDGE ◀" width={0.5} height={0.1} position={[COMMS.x0 + 0.01, 2.3, 0.6]} rotation={[0, Math.PI / 2, 0]} fg={PALETTE.plateText} />
    </group>
  );
}

// ------------------------------------------------------------ distribution panel

const DIST_RISER = 1.05;
const EMPTY_DRAW: DistData["draw"] = { PUMPS: 0, LIGHTS: 0, RADIO: 0, EVAC: 0, DAVITS: 0 };

function DistributionPanel({ position }: { position: [number, number, number] }) {
  const phase = useNav((v) => v.phase, "PROLOGUE" as Phase);
  const draw = useNavSlice((v) => v.dist.draw, EMPTY_DRAW);
  const circuits = useNavSlice((v) => v.ship.circuits, { LIGHTS: false, RADIO: false, EVAC: false } as Record<Circuit, boolean>);
  const pumpsOn = useNav((v) => v.flood.pumps.filter((p) => p.on).length, 0);
  const armed = useNav((v) => v.ship.armed, false);
  const gridDown = useNav((v) => v.ship.gridDown, false);
  const open = useNav((v) => roomOpen("COMMS", v.phase, v.outcome?.phaseReached), false);
  const live = CIRCUIT_PHASES.includes(phase);
  const evacInService = phase === "CASCADE" || phase === "ESCAPE";

  const map = useCanvasTexture(
    1024,
    736,
    (ctx, w, h) => (open ? drawDistribution(ctx, w, h, { draw, circuits, pumpsOn, armed, gridDown, evacInService }) : drawDead(ctx, w, h)),
    [open, draw, circuits, pumpsOn, armed, gridDown, evacInService],
  );
  return (
    <group position={position}>
      <ConsoleBody w={COMMS.dist.w} riserH={DIST_RISER}>
        <Screen map={map} width={1.1} height={0.79} position={[0, 0.9 + DIST_RISER / 2 + 0.1, RISER_Z]} delay={0.2} flashOn={["gridTrip", "gridReset"]} />
        <Plate text="DISTRIBUTION PANEL" width={0.9} height={0.1} position={[0, 0.9 + DIST_RISER + 0.25, -DESK_D / 2 + 0.01]} border={PALETTE.brass} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text="CIRCUIT SWITCHES · BRIDGE CONTROL" width={1.2} height={0.07} position={[0, 0.17, 0.03]} border={PALETTE.brassDark} />
          {CIRCUITS.map((c, i) => (
            <CircuitSwitch key={c} circuit={c} n={i + 1} x={-0.75 + i * 0.75} on={circuits[c]} live={live} gridDown={gridDown} />
          ))}
        </Slope>
      </ConsoleBody>
    </group>
  );
}

/** A big rotary breaker handle: OFF at −45°, ON at +45°, with a lamp and words. */
function CircuitSwitch(props: { circuit: Circuit; n: number; x: number; on: boolean; live: boolean; gridDown: boolean }) {
  const { circuit, n, x, on, live, gridDown } = props;
  const latch = useLatched(on);
  const handle = useRef<Group>(null);
  useFrame(() => {
    if (!handle.current) return;
    const target = latch.get() ? -Math.PI / 4 : Math.PI / 4;
    handle.current.rotation.z += (target - handle.current.rotation.z) * 0.3;
  });
  const onUse = useCallback(() => {
    if (!live) return;
    const want = !latch.get();
    latch.set(want);
    void send({ t: "setCircuit", circuit, on: want }).then((ack) => {
      if (!ack.ok) latch.clear();
    });
  }, [live, latch, circuit]);
  const name = CIRCUIT_LABEL[circuit];
  const note = circuit === "EVAC" ? " · charges the accumulator (Act IV on)" : circuit === "RADIO" ? " · needed to answer calls" : " · Engine Room's lamps";
  const prompt = `${name} circuit — ${on ? "ON" : "OFF"}${note} · E to switch ${on ? "OFF" : "ON"}`;
  return (
    <group position={[x, -0.01, 0]}>
      <Plate text={`${n} · ${name}`} width={0.66} height={0.06} position={[0, 0.095, 0.03]} fg={PALETTE.plateText} />
      <Interactable id={IDS.circuit(circuit)} prompt={prompt} onUse={onUse} disabled={!live}>
        <mesh geometry={GEO.cyl} material={MAT.bezel} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0.02]} scale={[0.085, 0.04, 0.085]} />
        <group ref={handle} position={[0, -0.01, 0.05]} rotation={[0, 0, on ? -Math.PI / 4 : Math.PI / 4]}>
          {/* the bar handle: a pointer at one end so the angle reads as a dial */}
          <mesh geometry={GEO.box} material={on ? MAT.brass : MAT.chrome} position={[0, 0.0, 0]} scale={[0.04, 0.17, 0.04]} />
          <mesh geometry={GEO.box} material={MAT.enamel} position={[0, 0.07, 0.022]} scale={[0.016, 0.04, 0.008]} />
        </group>
      </Interactable>
      {/* dial marks */}
      <Plate text="OFF" width={0.08} height={0.035} position={[-0.12, 0.04, 0.03]} fg="#c9c2ae" />
      <Plate text="ON" width={0.07} height={0.035} position={[0.12, 0.04, 0.03]} fg="#c9c2ae" />
      <Lamp on={on && !gridDown} r={0.022} position={[0.2, -0.05, 0.01]} />
      <Plate
        text={on ? (gridDown ? "ON · NO SUPPLY" : "ON") : "OFF"}
        width={on && gridDown ? 0.3 : 0.14}
        height={0.05}
        position={[0, -0.13, 0.03]}
        fg={on ? (gridDown ? PALETTE.lampAmber : PALETTE.lampGreen) : "#c9c2ae"}
      />
    </group>
  );
}

// ------------------------------------------------------------ evac accumulator + davits

function EvacPanel({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const phase = useNav((v) => v.phase, "PROLOGUE" as Phase);
  const evac = useNav((v) => Math.floor(v.ship.evac), 0);
  const online = useNav((v) => v.ship.evacOnline, false);
  const circuitOn = useNav((v) => v.ship.circuits.EVAC, false);
  const gridDown = useNav((v) => v.ship.gridDown, false);
  const armed = useNav((v) => v.ship.armed, false);
  const open = useNav((v) => roomOpen("COMMS", v.phase, v.outcome?.phaseReached), false);
  const stage = stageOf(phase);
  const d: EvacData = { evac, online, circuitOn, gridDown, armed, stage, escape: phase === "ESCAPE" };
  const map = useCanvasTexture(
    768,
    768,
    (ctx, w, h) => (open ? drawEvac(ctx, w, h, d) : drawDead(ctx, w, h)),
    [open, evac, online, circuitOn, gridDown, armed, stage, phase],
  );
  const stripes = useCanvasTexture(256, 256, (ctx, w, h) => hazardStripes(ctx, 0, 0, w, h, 32), []);

  const canArm = phase === "ESCAPE" && !armed;
  const cover = useRef<Group>(null);
  const { press, depth } = usePress();
  useFrame(() => {
    // the guard flips up while arming is possible
    if (cover.current) cover.current.rotation.x += ((canArm || armed ? -1.6 : 0) - cover.current.rotation.x) * 0.15;
  });
  const onArm = useCallback(() => {
    press();
    if (navView()?.phase === "ESCAPE") void send({ t: "armDavits" });
  }, [press]);
  const armPrompt = online
    ? evac >= FINALE.armCharge
      ? `ARM DAVITS — accumulator ${evac}% · E to arm`
      : `ARM DAVITS — accumulator only ${evac}% (needs ${FINALE.armCharge}%) · E to try`
    : `ARM DAVITS — accumulator not powered (EVAC circuit / generator) · E to try`;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block p={[0, 1.5, 0.04]} s={[COMMS.evac.w, 1.7, 0.08]} m={MAT.consoleDark} />
      <Block p={[0, 1.5, 0.085]} s={[COMMS.evac.w - 0.08, 1.62, 0.02]} m={MAT.console} />
      <Block p={[0, 0.3, 0.12]} s={[COMMS.evac.w, 0.6, 0.24]} m={MAT.console} />
      <Plate text="EVAC ACCUMULATOR · LIFEBOAT DAVITS" width={1.9} height={0.1} position={[0, 2.24, 0.1]} border={PALETTE.hazardYellow} />
      <Screen map={map} width={0.95} height={0.95} position={[-0.45, 1.5, 0.13]} delay={0.4} flashOn={["evacCharged", "davitsArmed", "gridTrip"]} />
      <Plate
        text={phase === "ESCAPE" ? "KEEP ≥ 50% · EVAC OFF DRAINS IT" : stage === "live" ? "ACT IV OBJECTIVE: CHARGE TO 100%" : stage === "before" ? "IN SERVICE FROM ACT IV" : "ACCUMULATOR SHUT DOWN"}
        width={0.95}
        height={0.07}
        position={[-0.45, 0.92, 0.1]}
        fg={stage === "live" ? PALETTE.lampAmber : "#9a9586"}
      />
      {/* ARM DAVITS: guarded push button */}
      <group position={[0.62, 1.5, 0.1]}>
        <mesh geometry={GEO.plane} position={[0, 0, 0.0]} scale={[0.6, 1.2, 1]}>
          <meshStandardMaterial map={stripes} roughness={0.7} />
        </mesh>
        <Block p={[0, 0, 0.008]} s={[0.5, 1.1, 0.012]} m={MAT.enamel} />
        <Plate text={"ARM\nDAVITS"} width={0.4} height={0.17} position={[0, 0.4, 0.02]} fg={PALETTE.lampAmber} border={PALETTE.lampAmber} />
        <group position={[0, 0.1, 0.015]}>
          <Interactable id={IDS.armDavits} prompt={armPrompt} onUse={onArm} disabled={!canArm}>
            <PushButton color="#d88a1f" r={0.075} lit={canArm} blink={canArm && online && evac >= FINALE.armCharge} depth={depth} held={armed} />
          </Interactable>
          {/* hinged clear guard over the button */}
          <group ref={cover} position={[0, 0.1, 0.04]}>
            <mesh geometry={GEO.box} position={[0, -0.1, 0.03]} scale={[0.2, 0.2, 0.005]}>
              <meshStandardMaterial color="#c8d8e0" transparent opacity={0.14} roughness={0.2} depthWrite={false} />
            </mesh>
            {/* brass rim so the flap reads as a hinged guard, not a grey patch */}
            <Block p={[0, 0, 0.03]} s={[0.2, 0.014, 0.012]} m={MAT.brassDark} />
            <Block p={[0, -0.2, 0.03]} s={[0.2, 0.014, 0.012]} m={MAT.brassDark} />
            <Block p={[-0.1, -0.1, 0.03]} s={[0.014, 0.2, 0.012]} m={MAT.brassDark} />
            <Block p={[0.1, -0.1, 0.03]} s={[0.014, 0.2, 0.012]} m={MAT.brassDark} />
          </group>
        </group>
        <Plate text={`ARMS AT ≥ ${FINALE.armCharge}% CHARGE`} width={0.44} height={0.06} position={[0, -0.12, 0.02]} fg={PALETTE.plateText} />
        <Plate text="EVAC CIRCUIT MUST BE ON" width={0.44} height={0.05} position={[0, -0.2, 0.02]} fg="#9a9586" />
        <Lamp on={armed} r={0.035} position={[-0.15, -0.36, 0.02]} />
        <Plate text={armed ? "DAVITS ARMED" : "NOT ARMED"} width={0.26} height={0.06} position={[0.06, -0.36, 0.02]} fg={armed ? PALETTE.lampGreen : "#9a9586"} />
        <Plate text={stage === "live" && phase === "ESCAPE" ? "ABANDON NEEDS ARMED DAVITS" : "LIVE IN ACT V"} width={0.44} height={0.05} position={[0, -0.47, 0.02]} fg="#9a9586" />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ coast-station call

const CALL_RISER = 0.85;

function CallPanel({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const phase = useNav((v) => v.phase, "PROLOGUE" as Phase);
  const call = useNavSlice((v) => v.call, null as CallData["call"]);
  const answered = useNav((v) => v.ship.callsAnswered, 0);
  const missed = useNav((v) => v.ship.callsMissed, 0);
  const radioOn = useNav((v) => v.ship.circuits.RADIO, false);
  const gridDown = useNav((v) => v.ship.gridDown, false);
  const calling = useNav((v) => v.ship.calling, false);
  const open = useNav((v) => roomOpen("COMMS", v.phase, v.outcome?.phaseReached), false);
  const stage = stageOf(phase);
  const map = useCanvasTexture(
    1024,
    512,
    (ctx, w, h) => (open ? drawCall(ctx, w, h, { stage, call, answered, missed, radioOn, gridDown }) : drawDead(ctx, w, h)),
    [open, stage, call, answered, missed, radioOn, gridDown],
  );
  const ringing = calling && phase === "CASCADE";
  const { press, depth } = usePress();
  const onAnswer = useCallback(() => {
    press();
    void send({ t: "answerCall" });
  }, [press]);
  const prompt = call ? `ANSWER — station calling from ${call.bearing}, ${call.remainingS} s · E to answer` : "ANSWER — station calling · E to answer";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ConsoleBody w={COMMS.call.w} riserH={CALL_RISER}>
        <Screen map={map} width={1.5} height={0.75} position={[0, 0.9 + CALL_RISER / 2, RISER_Z]} delay={0.3} flashOn={["call", "callResult"]} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text="ANTENNA MUST FACE CALLER · RADIO CIRCUIT ON" width={1.5} height={0.065} position={[0, 0.17, 0.03]} border={PALETTE.hazardYellow} fg={PALETTE.lampAmber} />
          {/* CALL lamp + words */}
          <group position={[-0.65, -0.0, 0]}>
            <Lamp on={ringing} color={PALETTE.lampAmber} blink r={0.05} position={[0, 0.03, 0.01]} />
            <Plate text={ringing ? "INCOMING" : "NO CALL"} width={0.26} height={0.06} position={[0, -0.08, 0.03]} fg={ringing ? PALETTE.lampAmber : "#9a9586"} />
            <Plate text="CALL" width={0.14} height={0.045} position={[0, 0.1, 0.03]} fg="#c9c2ae" />
          </group>
          {/* ANSWER */}
          <group position={[0, -0.01, 0]}>
            <Interactable id={IDS.answerCall} prompt={prompt} onUse={onAnswer} disabled={!ringing}>
              <PushButton color="#2f8f4e" r={0.08} lit={ringing} blink={ringing} depth={depth} />
            </Interactable>
            <Plate text="ANSWER" width={0.28} height={0.06} position={[0, -0.13, 0.03]} border={PALETTE.brass} />
          </group>
          <Plate text={`ANSWERED ${answered}\nMISSED ${missed}`} width={0.36} height={0.13} position={[0.62, -0.02, 0.03]} fg={PALETTE.plateText} border={PALETTE.brassDark} />
        </Slope>
      </ConsoleBody>
      <CallBell ringing={ringing} />
    </group>
  );
}

/** A small bell housing on top of the call console that shakes while ringing
 * (the audio ring's visual twin; still under reduced motion). */
function CallBell({ ringing }: { ringing: boolean }) {
  const bell = useRef<Group>(null);
  const live = useRef(ringing);
  live.current = ringing;
  useFrame(() => {
    if (!bell.current) return;
    const shake = live.current && !useStore.getState().reducedMotion ? Math.sin(nowS() * 38) * 0.18 : 0;
    bell.current.rotation.z = shake;
  });
  return (
    <group ref={bell} position={[0.85, 0.9 + CALL_RISER + 0.14, -0.3]}>
      <mesh geometry={GEO.sphere} material={MAT.brass} scale={[0.09, 0.07, 0.09]} />
      <mesh geometry={GEO.cyl} material={MAT.brassDark} position={[0, -0.08, 0]} scale={[0.03, 0.06, 0.03]} />
    </group>
  );
}

// ------------------------------------------------------------ notices (dressing)

function Paper({ draw, w, h, position, rotationY }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; position: [number, number, number]; rotationY: number }) {
  const map = useCanvasTexture(640, Math.round((640 * h) / w), draw, []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Block p={[0, 0, -0.012]} s={[w + 0.06, h + 0.06, 0.02]} m={MAT.wood} />
      <mesh geometry={GEO.plane} scale={[w, h, 1]}>
        <meshStandardMaterial map={map} roughness={0.9} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/** Non-interactive storytelling: crew list, muster plan, emergency card, the
 * ship's name board. Nothing here looks like a control (invariant 9). */
function Notices() {
  const board = useCanvasTexture(1024, 160, drawShipBoard, []);
  const west = COMMS.x0 + 0.01;
  return (
    <group>
      <Paper draw={drawRoster} w={0.8} h={0.62} position={[west, 1.6, -2.0]} rotationY={Math.PI / 2} />
      <Paper draw={drawEmergencyCard} w={0.62} h={0.62} position={[west, 1.55, 2.0]} rotationY={Math.PI / 2} />
      <Paper draw={drawMuster} w={0.62} h={0.45} position={[COMMS.x1 - 0.01, 1.6, -2.2]} rotationY={-Math.PI / 2} />
      <mesh geometry={GEO.plane} position={[COMMS.x1 - 0.01, 2.62, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[2.2, 0.34, 1]}>
        <meshBasicMaterial map={board} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}
