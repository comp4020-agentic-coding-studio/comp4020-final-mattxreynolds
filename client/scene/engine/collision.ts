// The Engineer's collision layout: the Engine Room, the bulkhead doorway and
// the Aux Machinery Room as a union of walkable boxes, every machine as a
// solid, and the watertight door as a `doors` entry that is solid until
// `auxOpen()` says the room is open. Pure (no React/three), so it is tested
// in spec/engine-room.unit.test.ts.

import { box, type Box, type RoomLayout } from "../colliders.ts";
import { AT, AUX, AUX_AT, SHIP_PANEL_AT } from "./layout.ts";

const SPAWN_X = -2.5;
const SPAWN_Z = -1.6;

/** The bulkhead doorway (x −5.35..−4.95): joins the two rooms' walkable boxes. */
export const DOORWAY: Box = {
  minX: AUX.wallW - 0.05,
  maxX: AUX.wallE + 0.05,
  minZ: AUX.doorZ - AUX.doorW / 2,
  maxZ: AUX.doorZ + AUX.doorW / 2,
};

export function engineLayout(auxOpen: () => boolean): RoomLayout {
  return {
    bounds: [
      box(0, 0, 10, 8), // Engine Room
      DOORWAY,
      { minX: AUX.minX, maxX: AUX.maxX, minZ: AUX.minZ, maxZ: AUX.maxZ }, // Aux Machinery Room
    ],
    // the watertight door: solid until the room opens (from FLOOD)
    doors: [
      {
        box: {
          minX: AUX.wallW,
          maxX: AUX.wallE,
          minZ: DOORWAY.minZ - 0.1,
          maxZ: DOORWAY.maxZ + 0.1,
        },
        open: auxOpen,
      },
    ],
    solids: [
      box(AT.busPanel[0], -3.85, 1.1, 0.3), // emergency bus panel
      box(AT.switchboard[0], -3.78, 3.3, 0.45), // switchboard
      box(AT.statusBoard[0], -3.9, 0.95, 0.2), // status board
      box(AT.transmitter[0], -3.6, 2.0, 0.85), // transmitter cabinet
      box(-4.3, -0.9, 1.1, 2.7), // generator
      box(AT.manifold[0], 3.7, 3.7, 0.65), // valve manifold
      box(3.4, 3.55, 1.7, 0.8), // workbench
      box(4.45, -1.3, 0.5, 0.5), // hand pump
      box(4.85, 1.55, 0.3, 0.7), // abandon lever panel
      box(4.75, -3.75, 0.3, 0.3), // corner risers
      box(-4.75, 3.75, 0.3, 0.3),
      box(SHIP_PANEL_AT[0] - 0.05, SHIP_PANEL_AT[2], 0.12, 1.05), // ship systems repeater
      // Aux Machinery Room
      box(AUX_AT.panel[0] + 0.22, AUX_AT.panel[2], 0.46, 2.2), // generator plant panel
      box(AUX_AT.machine[0], AUX_AT.machine[2], 3.0, 1.1), // aux generator set
      box(-9.74, 3.6, 1.1, 0.75), // oil drums
      // dressing (Dressing.tsx)
      box(4.5, 2.6, 0.75, 0.9), // lube-oil tank
      box(-4.15, 3.85, 0.85, 0.32), // lifejacket locker
      box(1.75, 3.88, 0.25, 0.25), // extinguisher (south)
      box(4.88, -0.98, 0.25, 0.25), // extinguisher (east)
      box(-3.55, -0.9, 0.1, 2.95), // generator handrail
      box(-5.8, -1.45, 0.85, 0.85), // aux lube-oil tank
      box(-6.8, 3.65, 1.3, 0.62), // aux workbench
      box(AUX_AT.machine[0] - 0.5, AUX_AT.machine[2] + 0.75, 2.0, 0.1), // aux handrail
      box(AUX.minX + 0.13, 2.85, 0.28, 0.62), // aux lifejacket locker
      box(AUX.maxX - 0.15, 3.35, 0.25, 0.25), // aux extinguisher
    ],
    spawn: [SPAWN_X, 1.6, SPAWN_Z],
    // face the EMERGENCY BUS lever (yaw 0 looks toward −Z)
    spawnYaw: Math.atan2(SPAWN_X - AT.busPanel[0], SPAWN_Z - (AT.busPanel[2] + 0.1)),
  };
}
