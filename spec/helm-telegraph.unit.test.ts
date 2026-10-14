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
const finale = puzzle("helm-telegraph@1");
const instances = Array.from({ length: INSTANCES }, (_, i) => finale.generate(seeded(i + 1)));
const inst = finale.instrument!;
const levels = ([min, max]: readonly [number, number]): number[] => Array.from({ length: max - min + 1 }, (_, i) => min + i);

describe("helm and telegraph v1", () => {
  it("is the finale's split instrument: the telegraph on the Lower Deck, the helm and the Clue on the Upper", () => {
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

  it("has exactly one setting in band given its Clues", () => {
    for (const data of instances.slice(0, 100)) {
      const all = levels(inst.limits.valves).flatMap((v) => levels(inst.limits.trims).map((t) => ({ valves: [v], trims: [t] })));
      expect(all.filter((s) => inst.inBand(data, s))).toHaveLength(1);
    }
  });

  it("starts out of band, and neither Deck alone can put it in band (a joint action is required)", () => {
    for (const data of instances) {
      const start = inst.initial(data);
      expect(inst.inBand(data, start)).toBe(false);
      expect(levels(inst.limits.valves).some((v) => inst.inBand(data, { valves: [v], trims: start.trims }))).toBe(false);
      expect(levels(inst.limits.trims).some((t) => inst.inBand(data, { valves: start.valves, trims: [t] }))).toBe(false);
    }
  });

  it("stays within the finale band on cross-Deck Clue values and minimum actions", () => {
    const { clueValues, minActions } = BANDS.finale;
    for (const data of instances) {
      expect(finale.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(finale.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(finale.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(finale.minActions(data)).toBeLessThanOrEqual(minActions[1]);
    }
  });

  it("minActions is the notches the two Decks need from the start to the one answer", () => {
    for (const data of instances.slice(0, 50)) {
      const target = settingsFromClue(finale.clue(data));
      const start = inst.initial(data);
      expect(finale.minActions(data)).toBe(Math.abs(target.valves[0] - start.valves[0]) + Math.abs(target.trims[0] - start.trims[0]));
    }
  });

  it("reads heading and speed off the dials, and the Clue states the targets those readings must meet", () => {
    for (const data of instances.slice(0, 50)) {
      const answer = settingsFromClue(finale.clue(data));
      const [heading, speed] = inst.readings(data, answer);
      expect(finale.clue(data)).toContain(`Heading target: ${heading}`);
      expect(finale.clue(data)).toMatch(new RegExp(`Speed target: (${speed} to ${speed + 1}|${speed - 1} to ${speed}) knots`));
    }
  });

  it("refuses an answer that is not in-band settings", () => {
    for (const bad of ["", "1234", "{}", '{"valves":[1,2],"trims":[0]}', "not json"]) expect(finale.check(instances[0], bad)).toBe(false);
  });

  it("varies from one Draw to the next, and reads back from stored JSON through its schema", () => {
    expect(new Set(instances.map((d) => finale.clue(d))).size).toBeGreaterThan(50);
    expect(finale.schema.parse(JSON.parse(JSON.stringify(instances[0])))).toEqual(instances[0]);
    expect(() => finale.schema.parse({ heading: 1 })).toThrow();
  });

  it("names its dials for the Decks", () => {
    expect(inst.names).toEqual({ valves: "Telegraph", trims: "Helm", gauges: ["Heading", "Speed"] });
  });
});

describe("the Draw picks a finale at random", () => {
  it("draws either finale across many Draws, and each is a split instrument", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const draw = generateDraw(seeded(i + 1));
      const entry = draw.puzzles.find((p) => p.slot === "finale")!;
      expect(puzzle(entry.key).instrument).toBeDefined();
      keys.add(entry.key);
    }
    expect([...keys].sort()).toEqual(["helm-telegraph@1", "valves-gauges@1"]);
  });
});
