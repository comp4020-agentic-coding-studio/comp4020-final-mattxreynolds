// Engine Room (Engineer). A compact 10 m × 8 m machinery space:
//   north wall  — EMERGENCY BUS panel (prologue), main switchboard (power),
//                 status board, W/T transmitter (radio)
//   west wall   — generator No.1 (power indicator)
//   south wall  — bilge suction manifold (flood)
//   east wall   — hand pump, watertight escape door, ABANDON lever (escape)
// Stations live in ./engine/; this file composes them, owns the collision
// layout and routes one-shot fx to particles and light kicks.

import { useEffect } from "react";
import { onFx } from "../store.ts";
import { box, type RoomLayout } from "./colliders.ts";
import { BusPanel } from "./engine/BusPanel.tsx";
import { Effects, kicks, spawnSparks, spawnSteam } from "./engine/Effects.tsx";
import { EscapeWall } from "./engine/EscapeWall.tsx";
import { Generator } from "./engine/Generator.tsx";
import { AT, pumpWorld, switchboardWorld, transmitterWorld, valveWorld } from "./engine/layout.ts";
import { Lighting } from "./engine/Lighting.tsx";
import { Manifold } from "./engine/Manifold.tsx";
import { Shell } from "./engine/Shell.tsx";
import { StatusBoard } from "./engine/StatusBoard.tsx";
import { Switchboard } from "./engine/Switchboard.tsx";
import { Transmitter } from "./engine/Transmitter.tsx";
import { Water } from "./engine/Water.tsx";

const SPAWN_X = -2.5;
const SPAWN_Z = -1.6;

export const ENGINE_LAYOUT: RoomLayout = {
  bounds: box(0, 0, 10, 8),
  solids: [
    box(AT.busPanel[0], -3.85, 1.1, 0.3), // emergency bus panel
    box(AT.switchboard[0], -3.78, 3.3, 0.45), // switchboard
    box(AT.statusBoard[0], -3.9, 0.95, 0.2), // status board
    box(AT.transmitter[0], -3.6, 2.0, 0.85), // transmitter cabinet
    box(-4.3, -0.9, 1.1, 2.7), // generator
    box(AT.manifold[0], 3.7, 3.7, 0.65), // valve manifold
    box(3.4, 3.55, 1.7, 0.8), // workbench
    box(4.45, -1.85, 0.5, 0.5), // hand pump
    box(4.85, 1.55, 0.3, 0.7), // abandon lever panel
    box(4.75, -3.75, 0.3, 0.3), // corner risers
    box(-4.75, 3.75, 0.3, 0.3),
  ],
  spawn: [SPAWN_X, 1.6, SPAWN_Z],
  // face the EMERGENCY BUS lever (yaw 0 looks toward −Z)
  spawnYaw: Math.atan2(SPAWN_X - AT.busPanel[0], SPAWN_Z - (AT.busPanel[2] + 0.1)),
};

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
          case "phase":
            if (fx.phase !== "LOST") kicks.flash = Math.max(kicks.flash, 0.35);
            break;
        }
      }),
    [],
  );
}

export function EngineRoom() {
  useFxRouting();
  return (
    <group>
      <Lighting />
      <Shell />
      <BusPanel />
      <Switchboard />
      <StatusBoard />
      <Transmitter />
      <Generator />
      <Manifold />
      <EscapeWall />
      <Water />
      <Effects />
    </group>
  );
}
