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
