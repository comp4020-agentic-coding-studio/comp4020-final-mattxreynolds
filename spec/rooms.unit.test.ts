import { describe, expect, it } from "vitest";
import { SLOTS, type Slot } from "../shared/draw.ts";
import { DECKS } from "../shared/intents.ts";
import { moveInRoom, reachableCells, roomForDeck, ROOMS, type Room } from "../shared/rooms.ts";

const NONE: ReadonlySet<Slot> = new Set();
const ALL: ReadonlySet<Slot> = new Set(SLOTS);

function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]);
  return [];
}

/** Is some reachable floor cell within the Room's reach of the thing? */
function withinReachOfFloor(room: Room, cells: { x: number; z: number }[], thing: { x: number; z: number }): boolean {
  return cells.some((c) => Math.hypot(c.x - thing.x, c.z - thing.z) <= room.reach);
}

describe("Room data", () => {
  it("each Deck has its own Room, the Wheelhouse above and the Engine Room below", () => {
    expect(ROOMS.map((r) => r.name)).toEqual(["Wheelhouse", "Engine Room"]);
    expect(roomForDeck("Upper Deck").name).toBe("Wheelhouse");
    expect(roomForDeck("Lower Deck").name).toBe("Engine Room");
    expect(new Set(ROOMS.map((r) => r.deck))).toEqual(new Set(DECKS));
  });

  for (const room of ROOMS) {
    describe(room.name, () => {
      it("declares no cue field anywhere", () => {
        expect(keys(room).filter((k) => /cue/i.test(k))).toEqual([]);
      });

      it("starts the Player on open floor", () => {
        expect(reachableCells(room, NONE).length).toBeGreaterThan(100);
      });

      it("keeps every usable thing within reach of floor walkable from the start once every Puzzle has opened its area", () => {
        const cells = reachableCells(room, ALL);
        const stranded = room.things.filter((t) => !withinReachOfFloor(room, cells, t)).map((t) => t.id);
        expect(stranded).toEqual([]);
      });

      it("keeps every thing that is not behind a Puzzle within reach from the start while everything is shut", () => {
        const cells = reachableCells(room, NONE);
        const stranded = room.things.filter((t) => !t.behind && !withinReachOfFloor(room, cells, t)).map((t) => t.id);
        expect(stranded).toEqual([]);
      });

      it("has a thing behind a Puzzle that is out of reach until that Puzzle opens", () => {
        const shut = reachableCells(room, NONE);
        const behind = room.things.filter((t) => t.behind);
        expect(behind.length).toBeGreaterThan(0);
        for (const t of behind) expect(withinReachOfFloor(room, shut, t), t.id).toBe(false);
      });
    });
  }
});

describe("walking", () => {
  const wheelhouse = roomForDeck("Upper Deck");

  it("moves freely across open floor", () => {
    const from = { x: wheelhouse.start.x, z: wheelhouse.start.z };
    expect(moveInRoom(wheelhouse, NONE, from, 0, -0.5)).toEqual({ x: from.x, z: from.z - 0.5 });
  });

  it("stops at the wall", () => {
    const to = moveInRoom(wheelhouse, NONE, { x: 4, z: 6 }, 0, 100);
    expect(to.z).toBeLessThan(wheelhouse.depth);
    expect(to.z).toBeGreaterThan(wheelhouse.depth - 1);
    expect(to.x).toBe(4);
  });

  it("slides along an obstacle instead of sticking to it", () => {
    // walk diagonally into the helm console: z is blocked, x still advances
    const helm = wheelhouse.blockers.find((b) => b.id === "helm")!;
    const inside = moveInRoom(wheelhouse, NONE, { x: (helm.box.minX + helm.box.maxX) / 2, z: helm.box.maxZ + 0.35 }, 0.3, -1);
    expect(inside.x).toBeCloseTo((helm.box.minX + helm.box.maxX) / 2 + 0.3);
    expect(inside.z).toBeGreaterThanOrEqual(helm.box.maxZ + 0.3 - 1e-9);
  });

  it("blocks a gate until its Puzzle has opened it, then lets the Player through", () => {
    const gate = wheelhouse.blockers.find((b) => b.opensWith)!;
    const slot = gate.opensWith!;
    const cx = (gate.box.minX + gate.box.maxX) / 2;
    const cz = (gate.box.minZ + gate.box.maxZ) / 2;
    const shut = moveInRoom(wheelhouse, NONE, { x: cx, z: gate.box.maxZ + 0.35 }, 0, cz - gate.box.maxZ - 0.35);
    const open = moveInRoom(wheelhouse, new Set([slot]), { x: cx, z: gate.box.maxZ + 0.35 }, 0, cz - gate.box.maxZ - 0.35);
    expect(shut.z).toBeGreaterThan(gate.box.maxZ);
    expect(open.z).toBeCloseTo(cz);
  });
});
