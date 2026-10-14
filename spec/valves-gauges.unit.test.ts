import { describe, expect, it } from "vitest";
import { generateDraw } from "../server/draw.ts";
import { BANDS } from "../server/puzzles/bands.ts";
import { puzzle } from "../server/puzzles/index.ts";
import { settingsFromClue } from "./helpers/finale.ts";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSTANCES = 500;
const finale = puzzle("valves-gauges@1");
const instances = Array.from({ length: INSTANCES }, (_, i) => finale.generate(seeded(i + 1)));
const inst = finale.instrument!;
const levels = ([min, max]: readonly [number, number]): number[] => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const everyLevel = (n: number, range: readonly [number, number]): number[][] =>
  Array.from({ length: n }).reduce<number[][]>((acc) => acc.flatMap((a) => levels(range).map((l) => [...a, l])), [[]]);

describe("valves and gauges v1", () => {
  it("is the finale's split instrument: valves on the Lower Deck, gauges and trims on the Upper", () => {
    expect(finale.slot).toBe("finale");
    expect(finale.decks).toEqual({ clue: "Upper Deck", lock: "Lower Deck" });
    expect(inst).toBeDefined();
  });

  it("is solvable: the rendered Clue text alone implies settings inside the band", () => {
    for (const data of instances) {
      const settings = settingsFromClue(finale.clue(data));
      expect(inst.inBand(data, settings)).toBe(true);
      expect(finale.check(data, JSON.stringify(settings))).toBe(true);
    }
  });

  it("starts out of band, and neither Deck alone can put it in band (a joint action is required)", () => {
    for (const data of instances.slice(0, 100)) {
      const start = inst.initial(data);
      const n = start.valves.length;
      expect(inst.inBand(data, start)).toBe(false);
      expect(everyLevel(n, inst.limits.valves).some((valves) => inst.inBand(data, { valves, trims: start.trims }))).toBe(false);
      expect(everyLevel(n, inst.limits.trims).some((trims) => inst.inBand(data, { valves: start.valves, trims }))).toBe(false);
    }
  });

  it("stays within the finale band on cross-Deck Clue values and minimum actions", () => {
    const { clueValues, minActions } = BANDS.finale;
    expect(clueValues).toEqual([4, 8]);
    for (const data of instances) {
      expect(finale.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(finale.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(finale.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(finale.minActions(data)).toBeLessThanOrEqual(minActions[1]);
    }
  });

  it("refuses an answer that is not in-band settings", () => {
    for (const bad of ["", "1234", "{}", '{"valves":[1],"trims":[0]}', "not json"]) expect(finale.check(instances[0], bad)).toBe(false);
  });

  it("varies from one Draw to the next, and reads back from stored JSON through its schema", () => {
    expect(new Set(instances.map((d) => finale.clue(d))).size).toBeGreaterThan(INSTANCES / 2);
    expect(finale.schema.parse(JSON.parse(JSON.stringify(instances[0])))).toEqual(instances[0]);
    expect(() => finale.schema.parse({ gauges: [] })).toThrow();
  });
});

describe("the Draw", () => {
  it("has one Puzzle per slot at most, and its finale is the split instrument", () => {
    for (let i = 0; i < 50; i++) {
      const draw = generateDraw(seeded(i + 1));
      const slots = draw.puzzles.map((p) => p.slot);
      expect(new Set(slots).size).toBe(slots.length);
      expect(puzzle(draw.puzzles.find((p) => p.slot === "finale")!.key).instrument).toBeDefined();
    }
  });
});
