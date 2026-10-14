import { describe, expect, it } from "vitest";
import { SLOTS } from "../shared/draw.ts";
import { displayText, inReach, projectedSize, reachableCells, roomForDeck, ROOMS, type Room, type Thing } from "../shared/rooms.ts";

// Valves and gauges worked in the scene (#55, #18): the sizes are checked from
// Room data alone, at 390x844 where the scene is 50vh tall.
const PHONE = { width: 390, height: 422 };
const ALL = new Set(SLOTS);
const controls = (room: Room): Thing[] => room.things.filter((t) => t.control);

describe("projectedSize", () => {
  it("a 1 m square plate 1 m straight ahead measures about 254 px at 390x844 (75 degree horizontal view)", () => {
    const room = roomForDeck("Upper Deck");
    const plate = { x: 4, z: 3, size: [1, 1, 1] as [number, number, number] };
    const px = projectedSize(room, { x: 4, z: 4, yaw: 0 }, plate, PHONE);
    expect(px.width).toBeCloseTo(254, 0);
    expect(px.height).toBeCloseTo(254, 0);
  });

  it("a plate twice as far away is half the size, and one seen side-on across the wall uses its depth axis", () => {
    const room = roomForDeck("Upper Deck");
    const plate = { x: 7.9, z: 5, size: [0.1, 0.4, 0.4] as [number, number, number] };
    const east = -Math.PI / 2;
    expect(projectedSize(room, { x: 6.9, z: 5, yaw: east }, plate, PHONE).width).toBeCloseTo(101.6, 0);
    expect(projectedSize(room, { x: 5.9, z: 5, yaw: east }, plate, PHONE).width).toBeCloseTo(50.8, 0);
  });
});

describe("the finale's controls in each Room", () => {
  it("the Engine Room turns three valves down and up, the Wheelhouse sets three trims down and up, all of the finale", () => {
    const named = (room: Room): string[] => controls(room).map((t) => `${t.control!.kind}:${t.control!.index}:${t.control!.by}`).sort();
    const expected = (kind: string): string[] => [0, 1, 2].flatMap((i) => [-1, 1].map((by) => `${kind}:${i}:${by}`)).sort();
    expect(named(roomForDeck("Lower Deck"))).toEqual(expected("turn-valve"));
    expect(named(roomForDeck("Upper Deck"))).toEqual(expected("turn-trim"));
    for (const room of ROOMS) for (const t of controls(room)) expect([t.kind, t.slot], t.id).toEqual(["station", "finale"]);
  });

  for (const room of ROOMS) {
    describe(room.name, () => {
      it("measures every control at 44 px or more at 390x844 even from the furthest spot within reach", () => {
        const east = -Math.PI / 2;
        for (const t of controls(room)) {
          const far = { x: t.x - (room.reach - 0.1), z: t.z, yaw: east };
          expect(inReach(room, far, t), `${t.id} in reach`).toBe(true);
          const px = projectedSize(room, far, t, PHONE);
          expect(Math.min(px.width, px.height), t.id).toBeGreaterThanOrEqual(44);
        }
      });

      it("records a standing spot on walkable floor from which every control and readout is in reach and on screen", () => {
        const spot = room.finaleStand!;
        expect(reachableCells(room, ALL).some((c) => Math.hypot(c.x - spot.x, c.z - spot.z) < 0.15)).toBe(true);
        for (const t of [...controls(room), ...room.displays]) {
          expect(inReach(room, spot, t), `${t.id} in reach`).toBe(true);
          const px = projectedSize(room, spot, t, PHONE);
          expect(Math.min(px.width, px.height)).toBeGreaterThanOrEqual(44);
        }
      });

      it("keeps controls more than two hit radii apart on screen from the standing spot, so the nearest always wins", () => {
        const spot = room.finaleStand!;
        const cs = controls(room);
        for (const a of cs) for (const b of cs) {
          if (a === b) continue;
          const f = projectedSize(room, spot, { ...a, size: [1, 1, 1] }, PHONE).width;
          expect(Math.hypot(b.z - a.z, b.y - a.y) * f, `${a.id} vs ${b.id}`).toBeGreaterThan(room.hitRadiusPx * 2);
        }
      });
    });
  }

  it("each Deck shows only its own half: valve levels in the Engine Room; readings, trims and the hold in the Wheelhouse", () => {
    expect(roomForDeck("Lower Deck").displays.map((d) => d.show)).toEqual(["valve", "valve", "valve"]);
    expect(roomForDeck("Upper Deck").displays.map((d) => d.show).sort()).toEqual(["gauge", "gauge", "gauge", "hold"]);
  });
});

describe("displayText", () => {
  const d = (show: "valve" | "gauge" | "hold", index = 0) => ({ id: "x", show, index, x: 0, y: 0, z: 0, size: [1, 1, 1] as [number, number, number] });

  it("writes a valve's level, a gauge's reading with its trim, and the hold in whole seconds", () => {
    expect(displayText(d("valve", 1), { range: [0, 9], valves: [3, 7, 1] })).toBe("7");
    expect(displayText(d("gauge", 2), { range: [-4, 4], trims: [0, 0, -3], readings: [10, 11, 12] })).toBe("12  trim -3");
    expect(displayText(d("hold"), { range: [-4, 4], holdMs: 3400 })).toBe("In band 3 s of 10");
    expect(displayText(d("hold"), { range: [-4, 4], holdMs: 3400 }, 1000)).toBe("In band 4 s of 10");
    expect(displayText(d("hold"), { range: [-4, 4], holdMs: 9900 }, 5000)).toBe("In band 10 s of 10");
    expect(displayText(d("hold"), { range: [-4, 4], holdMs: null }, 5000)).toBe("Out of band");
  });

  it("is blank when the instrument is not live, and once launched every display says the Lifeboat is away", () => {
    expect(displayText(d("valve"), null)).toBe("");
    expect(displayText(d("hold"), null, 0, true)).toBe("Lifeboat away");
    expect(displayText(d("valve"), null, 0, true)).toBe("Launched");
    expect(displayText(d("gauge"), null, 0, true)).toBe("Launched");
  });
});
