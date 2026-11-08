// The Engineer's collision layout: the Aux Machinery Room is reachable only
// through its bulkhead door, and only once the door is open; the doorway is
// wide enough not to snag the player; the walls stay solid.

import { describe, expect, it } from "vitest";
import { roomOpen } from "../shared/protocol.ts";
import { moveWithCollision, PLAYER_RADIUS, type RoomLayout } from "../client/scene/colliders.ts";
import { DOORWAY, engineLayout } from "../client/scene/engine/collision.ts";
import { AUX, AUX_AT } from "../client/scene/engine/layout.ts";

/** Walks toward (tx, tz) in small steps; returns where the player ends up. */
function walk(layout: RoomLayout, from: [number, number], to: [number, number], steps = 600): [number, number] {
  let [x, z] = from;
  for (let i = 0; i < steps; i++) {
    const dx = to[0] - x;
    const dz = to[1] - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) break;
    const s = Math.min(0.05, d);
    [x, z] = moveWithCollision(layout, x, z, (dx / d) * s, (dz / d) * s);
  }
  return [x, z];
}

const inEngineRoom: [number, number] = [-4.0, AUX.doorZ];
const inAuxRoom: [number, number] = [-7.6, 1.2];

describe("Engine Room ↔ Aux Machinery Room", () => {
  it("the bulkhead door is solid while sealed", () => {
    const layout = engineLayout(() => false);
    const [x] = walk(layout, inEngineRoom, inAuxRoom);
    expect(x).toBeGreaterThan(AUX.wallE);
  });

  it("once open, the player walks straight through to the generator plant panel", () => {
    const layout = engineLayout(() => true);
    const end = walk(layout, inEngineRoom, inAuxRoom);
    expect(end[0]).toBeCloseTo(inAuxRoom[0], 1);
    expect(end[1]).toBeCloseTo(inAuxRoom[1], 1);
    // and up to the panel (it is a solid, so they stop in front of it)
    const [px] = walk(layout, inAuxRoom, [AUX_AT.panel[0] + 0.2, AUX_AT.panel[2]]);
    expect(px).toBeLessThan(AUX_AT.panel[0] + 1.1);
    // and back again
    const back = walk(layout, [px, AUX_AT.panel[2]], inEngineRoom);
    expect(back[0]).toBeCloseTo(inEngineRoom[0], 1);
  });

  it("the doorway clears the player with room to spare", () => {
    expect(DOORWAY.maxZ - DOORWAY.minZ).toBeGreaterThanOrEqual(1.0);
    expect(DOORWAY.maxZ - DOORWAY.minZ).toBeGreaterThan(PLAYER_RADIUS * 2 + 0.3);
  });

  it("diagonal approaches from either side slide along the jamb into the room", () => {
    const layout = engineLayout(() => true);
    for (const z0 of [0.8, 3.5]) {
      const end = walk(layout, [-3.2, z0], [-7.5, AUX.doorZ], 900);
      expect(end[0]).toBeLessThan(AUX.wallW - PLAYER_RADIUS);
    }
  });

  it("the wall beside the doorway is solid even with the door open", () => {
    const layout = engineLayout(() => true);
    const [x] = walk(layout, [-4.0, 0.9], [-7.0, 0.9]);
    expect(x).toBeGreaterThanOrEqual(-5 + PLAYER_RADIUS - 1e-6);
  });

  it("the spawn point is clear of every solid", () => {
    const layout = engineLayout(() => false);
    const [sx, , sz] = layout.spawn;
    expect(moveWithCollision(layout, sx, sz, 0, 0)).toEqual([sx, sz]);
  });

  it("the room opens from FLOOD on (shared/protocol.ts roomOpen)", () => {
    expect(roomOpen("AUX", "POWER")).toBe(false);
    for (const p of ["FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED"] as const) expect(roomOpen("AUX", p)).toBe(true);
    expect(roomOpen("AUX", "LOST", "POWER")).toBe(false);
    expect(roomOpen("AUX", "LOST", "CASCADE")).toBe(true);
  });
});
