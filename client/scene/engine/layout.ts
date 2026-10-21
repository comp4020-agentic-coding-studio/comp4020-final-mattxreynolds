// Where everything in the Engine Room stands. Room: x −5..5, z −4..4,
// ceiling at 3 m. North wall (z = −4) carries the emergency bus panel, the
// switchboard and the transmitter; the generator fills the west end; the
// valve manifold is on the south wall; the escape door is in the east wall
// (the far end), with the hand pump and the abandon lever either side.

import type { Compartment } from "../../../shared/glyphs.ts";

type V3 = [number, number, number];

export const ROOM = { w: 10, d: 8, h: 3, minX: -5, maxX: 5, minZ: -4, maxZ: 4 } as const;

/** Wall-facing rotations (Y) for groups authored facing +Z. */
export const FACE = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 } as const;

export const AT = {
  busPanel: [-3.45, 0, -3.95] as V3,
  switchboard: [-0.85, 0, -3.95] as V3,
  statusBoard: [1.32, 0, -3.95] as V3,
  transmitter: [2.95, 0, -3.95] as V3,
  generator: [-4.25, 0, -0.9] as V3,
  manifold: [-0.6, 0, 3.95] as V3,
  /** escape wall group origin (east wall, facing −X); local +x = world +z */
  escapeWall: [5, 0, 0] as V3,
  beacon: [-1.2, 2.86, -1.4] as V3,
} as const;

/** Valve column offsets along the manifold (local x; the manifold faces −Z so local +x is world −x). */
export const VALVE_X: Record<Compartment, number> = { FORE: -1.15, CARGO: 0, ENGINE: 1.15 };
/** World position of a valve's handwheel, for steam puffs. */
export const valveWorld = (c: Compartment): V3 => [AT.manifold[0] - VALVE_X[c], 1.05, AT.manifold[2] - 0.45];

/** Local x on the escape wall (= world z). */
export const ESC = { pumpX: -1.85, pumpZ: 0.55, doorW: 1.3, doorH: 2.1, abandonX: 1.55 } as const;
export const pumpWorld: V3 = [AT.escapeWall[0] - ESC.pumpZ, 1.0, ESC.pumpX];
export const switchboardWorld: V3 = [AT.switchboard[0], 1.5, AT.switchboard[2] + 0.5];
export const transmitterWorld: V3 = [AT.transmitter[0], 1.3, AT.transmitter[2] + 0.75];

// ---------------------------------------------------------------- Aux Machinery Room
// West of the Engine Room through a watertight bulkhead door in the west wall
// at z = 2 (clear of generator No.1 at z −2.2..0.4 and the corner riser).
// The bulkhead is a 0.3 m cavity (x −5.3..−5.0) the door leaf slides into.
// Room: x −10.3..−5.3, z −2..4 (5 m × 6 m). The plant panel faces the
// doorway on the west wall; the auxiliary generator stands along the north
// wall; ship's plates and the crew notice are on the south wall.

export const AUX = {
  minX: -10.3,
  maxX: -5.3,
  minZ: -2,
  maxZ: 4,
  h: 3,
  /** bulkhead faces (engine side, aux side) */
  wallE: -5,
  wallW: -5.3,
  /** doorway centre (z), clear width and height */
  doorZ: 2,
  doorW: 1.2,
  doorH: 2.0,
} as const;
export const AUX_CX = (AUX.minX + AUX.maxX) / 2;
export const AUX_CZ = (AUX.minZ + AUX.maxZ) / 2;
export const AUX_W = AUX.maxX - AUX.minX;
export const AUX_D = AUX.maxZ - AUX.minZ;

export const AUX_AT = {
  /** generator plant panel on the west wall, facing +X (the doorway); local +x = world −z */
  panel: [AUX.minX, 0, 1.2] as V3,
  /** auxiliary generator set along the north wall, facing +Z */
  machine: [-7.9, 0, AUX.minZ + 0.6] as V3,
  /** ship's plates on the south wall, facing −Z */
  plates: [-8.3, 0, AUX.maxZ] as V3,
} as const;
/** RESET button local position on the plant panel (x along the panel, y up). */
export const RESET_AT = { x: 0, y: 0.98 } as const;
/** where sparks / steam come out of the auxiliary generator */
export const auxGenWorld: V3 = [AUX_AT.machine[0] + 0.55, 1.1, AUX_AT.machine[2] + 0.55];
export const auxExhaustWorld: V3 = [AUX_AT.machine[0] - 0.9, 2.1, AUX_AT.machine[2] + 0.1];
/** ship systems repeater (evac accumulator, coast-station call): the east
 * bulkhead's north end, beside the transmitter; faces −X */
export const SHIP_PANEL_AT: V3 = [5, 0, -2.95];
