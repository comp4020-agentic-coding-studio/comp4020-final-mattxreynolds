// Engine Room (Engineer). A compact 10 m × 8 m machinery space:
//   north wall  — EMERGENCY BUS panel (prologue), main switchboard (power),
//                 status board, W/T transmitter (radio)
//   west wall   — generator No.1 (power indicator)
//   south wall  — bilge suction manifold (flood)
//   east wall   — ship systems repeater (evac charge, coast-station call),
//                 hand pump, watertight escape door, ABANDON lever + DAVITS lamp
//   west door   — the Aux Machinery Room (generator plant + RESET), open from FLOOD
// Stations live in ./engine/; this file composes them, owns the collision
// layout and routes one-shot fx to particles and light kicks.

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { onFx, useStore } from "../store.ts";
import type { RoomLayout } from "./colliders.ts";
import { BusPanel } from "./engine/BusPanel.tsx";
import { EngineDressing } from "./engine/Dressing.tsx";
import { Effects, kicks, spawnSparks, spawnSteam } from "./engine/Effects.tsx";
import { EscapeWall } from "./engine/EscapeWall.tsx";
import { Generator } from "./engine/Generator.tsx";
import { AuxRoom, auxOpenNow } from "./engine/AuxRoom.tsx";
import { engineLayout } from "./engine/collision.ts";
import { auxExhaustWorld, auxGenWorld, pumpWorld, switchboardWorld, transmitterWorld, valveWorld } from "./engine/layout.ts";
import { Lighting } from "./engine/Lighting.tsx";
import { Manifold } from "./engine/Manifold.tsx";
import { Shell } from "./engine/Shell.tsx";
import { ShipPanel } from "./engine/ShipPanel.tsx";
import { StatusBoard } from "./engine/StatusBoard.tsx";
import { Switchboard } from "./engine/Switchboard.tsx";
import { Transmitter } from "./engine/Transmitter.tsx";
import { Water } from "./engine/Water.tsx";

/** Engine Room + doorway + Aux Machinery Room; the bulkhead door is solid
 * until the room opens (engine/collision.ts). */
export const ENGINE_LAYOUT: RoomLayout = engineLayout(auxOpenNow);

function useFxRouting(): void {
  useEffect(
    () =>
      onFx((fx) => {
        switch (fx.k) {
          case "busOn":
            kicks.flash = Math.max(kicks.flash, 0.6);
            break;
          case "trip":
            spawnSparks(switchboardWorld, 36);
            kicks.dip = 1;
            break;
          case "powerOnline":
            kicks.flash = 1;
            break;
          case "burst":
            spawnSteam(valveWorld(fx.compartment), [0, 0.2, -1], 18);
            break;
          case "arc":
            spawnSparks(transmitterWorld, 28);
            kicks.arc = 1;
            break;
          case "coupled":
            kicks.hum = 1;
            break;
          case "reply":
            if (fx.result === "contact") kicks.contact = 2.5;
            break;
          case "vent":
            spawnSteam(pumpWorld, [-1, 0.4, 0], 20);
            break;
          case "doorOpen":
            kicks.flash = Math.max(kicks.flash, 0.5);
            break;
          case "gridTrip":
            spawnSparks(auxGenWorld, 40);
            kicks.dip = 1;
            kicks.shudder = Math.max(kicks.shudder, 0.4);
            break;
          case "gridReset":
            kicks.flash = Math.max(kicks.flash, 0.8);
            break;
          case "overheat":
            spawnSteam(auxExhaustWorld, [0.3, 1, 0.3], 16);
            break;
          case "breach":
            kicks.shudder = 1;
            break;
          case "compartmentLost":
            kicks.dip = 1;
            kicks.shudder = 1.4;
            break;
          case "evacCharged":
            kicks.flash = Math.max(kicks.flash, 0.5);
            break;
          case "davitsArmed":
            if (fx.armed) kicks.flash = Math.max(kicks.flash, 0.4);
            else kicks.dip = Math.max(kicks.dip, 0.5);
            break;
          case "phase":
            if (fx.phase !== "LOST") kicks.flash = Math.max(kicks.flash, 0.35);
            break;
        }
      }),
    [],
  );
}

/** Shakes the whole room briefly on a hull breach (kicks.shudder). */
function useShudder() {
  const ref = useRef<Group>(null);
  useFrame((_, rawDt) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    kicks.shudder = Math.max(0, kicks.shudder - dt * 1.6);
    const k = useStore.getState().reducedMotion ? 0 : Math.min(1, kicks.shudder);
    const t = performance.now() / 1000;
    g.position.set(Math.sin(t * 61) * 0.025 * k, Math.sin(t * 47 + 1) * 0.018 * k, Math.sin(t * 53 + 2) * 0.02 * k);
    g.rotation.z = Math.sin(t * 37) * 0.006 * k;
  });
  return ref;
}

export function EngineRoom() {
  useFxRouting();
  const shake = useShudder();
  return (
    <group ref={shake}>
      <Lighting />
      <Shell />
      <BusPanel />
      <Switchboard />
      <StatusBoard />
      <Transmitter />
      <Generator />
      <Manifold />
      <EscapeWall />
      <ShipPanel />
      <EngineDressing />
      <AuxRoom />
      <Water />
      <Effects />
    </group>
  );
}
