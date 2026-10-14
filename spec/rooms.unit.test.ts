import { describe, expect, it } from "vitest";
import { SLOTS, type Slot } from "../shared/draw.ts";
import { DECKS } from "../shared/intents.ts";
import { examineText, inReach, moveInRoom, pickThing, reachableCells, roomForDeck, ROOMS, type Room } from "../shared/rooms.ts";

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

describe("using things within reach (#52)", () => {
  const wheelhouse = roomForDeck("Upper Deck");
  const thing = (id: string) => wheelhouse.things.find((t) => t.id === id)!;
  const facingNorth = (x: number, z: number) => ({ x, z, yaw: 0 });

  it("records the reach (about 2 m) and the 22 px hit radius in Room data", () => {
    for (const room of ROOMS) {
      expect(room.reach).toBe(2);
      expect(room.hitRadiusPx).toBe(22);
    }
  });

  it("a thing is usable inside reach and in front of the Player, and not beyond 2 m", () => {
    expect(inReach(wheelhouse, facingNorth(2, 2), thing("mural"))).toBe(true);
    expect(inReach(wheelhouse, facingNorth(2, 2.5), thing("mural"))).toBe(false);
  });

  it("a thing behind the Player is not usable, however close", () => {
    expect(inReach(wheelhouse, { x: 2, z: 1, yaw: Math.PI }, thing("mural"))).toBe(false);
    expect(inReach(wheelhouse, { x: 2, z: 1, yaw: 0 }, thing("mural"))).toBe(true);
  });

  it("the nearest thing within the hit radius wins, and a press with none near is a miss", () => {
    const room = { ...wheelhouse, things: [thing("mural"), { ...thing("brass-barometer"), x: 3, z: 1.5 }] };
    const pose = facingNorth(2.5, 1.8);
    const px = (a: number, b: number) => (t: { id: string }) => (t.id === "mural" ? a : b);
    expect(pickThing(room, pose, px(15, 6))?.id).toBe("brass-barometer");
    expect(pickThing(room, pose, px(10, 12))?.id).toBe("mural");
    expect(pickThing(room, pose, px(22, 40))?.id).toBe("mural");
    expect(pickThing(room, pose, px(22.5, 40))).toBeNull();
  });

  it("never picks a thing that is out of reach or behind, even under the pointer", () => {
    expect(pickThing(wheelhouse, facingNorth(4, 6.8), () => 0)).toBeNull();
  });

  for (const room of ROOMS) {
    describe(room.name, () => {
      it("holds at least one decoy", () => {
        expect(room.things.filter((t) => t.kind === "decoy").length).toBeGreaterThan(0);
      });

      it("gives every thing an effect when used, whichever Puzzles are live (no silent hit)", () => {
        for (const live of [NONE, new Set<Slot>(["opener"]), new Set<Slot>(["middle"]), ALL]) {
          for (const t of room.things) expect(examineText(t, live).trim().length, `${t.id}`).toBeGreaterThan(0);
        }
      });

      it("examines a decoy to its plaque and a station that is not live to rusted solid", () => {
        for (const t of room.things) {
          if (t.kind === "decoy") expect(examineText(t, NONE)).toBe(t.plaque);
          else if (t.slot !== "opener") expect(examineText(t, NONE)).toMatch(/rusted solid/i);
        }
      });
    });
  }
});
