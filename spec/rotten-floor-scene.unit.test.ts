import { describe, expect, it } from "vitest";
import { rottenFloorV1 } from "../server/puzzles/rotten-floor/v1.ts";
import { roomForDeck, tileCentre } from "../shared/rooms.ts";

// The rotten floor laid out in the Wheelhouse, and the plan board in the Engine Room (#54).
describe("the rotten floor in the Wheelhouse", () => {
  const wheelhouse = roomForDeck("Upper Deck");

  it("lays out as many tiles as the Puzzle's floor has, inside the Room", () => {
    const data = rottenFloorV1.generate(() => 0.5);
    const f = wheelhouse.floor!;
    expect([f.cols, f.rows]).toEqual([data.width, data.height]);
    expect(f.x0).toBeGreaterThanOrEqual(0);
    expect(f.z0).toBeGreaterThanOrEqual(0);
    expect(f.x0 + f.cols * f.tile).toBeLessThanOrEqual(wheelhouse.width);
    expect(f.z0 + f.rows * f.tile).toBeLessThanOrEqual(wheelhouse.depth);
  });

  it("puts A1 at the south-west corner and the far row to the north", () => {
    const f = wheelhouse.floor!;
    const a1 = tileCentre(wheelhouse, "A1")!;
    expect(a1.x).toBeCloseTo(f.x0 + f.tile / 2);
    expect(a1.z).toBeCloseTo(f.z0 + (f.rows - 1) * f.tile + f.tile / 2);
    expect(tileCentre(wheelhouse, "B2")!.x).toBeCloseTo(f.x0 + 1.5 * f.tile);
    expect(tileCentre(wheelhouse, "B2")!.z).toBeCloseTo(f.z0 + (f.rows - 2) * f.tile + f.tile / 2);
    expect(tileCentre(wheelhouse, "nonsense")).toBeNull();
    expect(tileCentre(wheelhouse, "F1")).toBeNull();
  });

  it("the Engine Room has no dark floor, but a board for the plan inside its walls", () => {
    const engine = roomForDeck("Lower Deck");
    expect(engine.floor).toBeUndefined();
    expect(wheelhouse.planBoard).toBeUndefined();
    const b = engine.planBoard!;
    expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w / 2).toBeLessThanOrEqual(engine.width);
  });
});
