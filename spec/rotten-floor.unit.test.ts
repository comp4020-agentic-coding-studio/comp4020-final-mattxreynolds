import { describe, expect, it } from "vitest";
import { BANDS } from "../server/puzzles/bands.ts";
import { puzzle } from "../server/puzzles/index.ts";
import { DIRS, parsePlan, routes } from "./helpers/rotten-floor.ts";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const floor = puzzle("rotten-floor@1");
const walk = floor.walk!;
const draws = Array.from({ length: 300 }, (_, i) => floor.generate(seeded(i + 1)));

describe("rotten floor v1", () => {
  it("is the middle slot, planned on the Lower Deck and walked on the Upper Deck", () => {
    expect(floor.slot).toBe("middle");
    expect(floor.decks).toEqual({ clue: "Lower Deck", lock: "Upper Deck" });
  });

  it("is solvable: the rendered plan text alone implies steps the server's rules accept", () => {
    for (const data of draws) {
      const [route] = routes(parsePlan(floor.clue(data)));
      let pos = walk.start(data);
      let last = "none";
      for (const dir of route) {
        const stepped = walk.step(data, pos, dir);
        last = stepped.kind;
        pos = stepped.pos;
        expect(["moved", "far-side"]).toContain(last);
      }
      expect(last).toBe("far-side");
    }
  });

  it("has exactly one safe path given the plan", () => {
    for (const data of draws) expect(routes(parsePlan(floor.clue(data)))).toHaveLength(1);
  });

  it("stays within the middle band on Clue values and minimum actions", () => {
    const { clueValues, minActions } = BANDS.middle;
    expect(clueValues).toEqual([8, 14]);
    for (const data of draws) {
      expect(floor.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(floor.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(floor.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(floor.minActions(data)).toBeLessThanOrEqual(minActions[1]);
      expect(floor.minActions(data)).toBe(routes(parsePlan(floor.clue(data)))[0].length);
    }
  });

  it("is crossed blind, without the plan, at most 1 time in 10", () => {
    const random = seeded(7);
    let crossed = 0;
    let trials = 0;
    for (const data of draws) {
      for (let t = 0; t < 40; t++) {
        trials++;
        let pos = walk.start(data);
        for (let i = 0; i < 200; i++) {
          const lit = walk.view(data, pos).lit;
          const stepped = walk.step(data, pos, lit[Math.floor(random() * lit.length)].dir);
          if (stepped.kind === "trapdoor") break;
          if (stepped.kind === "far-side") {
            crossed++;
            break;
          }
          pos = stepped.pos;
        }
      }
    }
    expect(crossed / trials).toBeLessThanOrEqual(0.1);
  });

  it("shows the Walker only the tiles beside them, never which are trapdoors", () => {
    for (const data of draws.slice(0, 50)) {
      const view = walk.view(data, walk.start(data));
      expect(view.lit.length).toBeGreaterThan(0);
      expect(view.lit.length).toBeLessThanOrEqual(4);
      expect(JSON.stringify(view)).not.toMatch(/trapdoor|safe|path|X|S\b/);
    }
  });

  it("returns a trapdoor step to the start and refuses a step off the floor", () => {
    let trapdoors = 0;
    for (const data of draws) {
      const start = walk.start(data);
      for (const dir of DIRS) {
        const stepped = walk.step(data, start, dir);
        if (stepped.kind === "trapdoor") {
          trapdoors++;
          expect(stepped.pos).toEqual(start);
        }
      }
      expect(walk.step(data, start, "south").kind).toBe("edge");
    }
    expect(trapdoors).toBeGreaterThan(draws.length / 2);
  });

  it("varies from one Draw to the next and reads back from stored JSON", () => {
    expect(new Set(draws.map((d) => floor.clue(d))).size).toBeGreaterThan(draws.length / 2);
    expect(floor.schema.parse(JSON.parse(JSON.stringify(draws[0])))).toEqual(draws[0]);
    expect(() => floor.schema.parse({ width: 5 })).toThrow();
  });
});
