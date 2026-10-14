import { describe, expect, it } from "vitest";
import { generateDraw } from "../server/draw.ts";
import { BANDS } from "../server/puzzles/bands.ts";
import { puzzle, versionsFor } from "../server/puzzles/index.ts";
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

const bilge = puzzle("bilge-plates@1");
const walk = bilge.walk!;
const draws = Array.from({ length: 300 }, (_, i) => bilge.generate(seeded(i + 1)));

describe("bilge plates v1", () => {
  it("is a middle Puzzle, surveyed on the Lower Deck and walked on the Upper Deck", () => {
    expect(bilge.slot).toBe("middle");
    expect(bilge.decks).toEqual({ clue: "Lower Deck", lock: "Upper Deck" });
    expect(versionsFor("middle").map((v) => v.key).sort()).toEqual(["bilge-plates@1", "rotten-floor@1"]);
  });

  it("is solvable: the rendered survey text alone implies steps the server's rules accept", () => {
    for (const data of draws) {
      const [route] = routes(parsePlan(bilge.clue(data)));
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

  it("has exactly one safe path given the survey, written as a bilge survey and not the rotten floor's grid", () => {
    for (const data of draws) {
      expect(routes(parsePlan(bilge.clue(data)))).toHaveLength(1);
      expect(bilge.clue(data)).toMatch(/bilge/i);
      expect(bilge.clue(data)).not.toMatch(/^Row \d+:/m);
    }
  });

  it("stays within the middle band", () => {
    const { clueValues, minActions } = BANDS.middle;
    for (const data of draws) {
      expect(bilge.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(bilge.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(bilge.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(bilge.minActions(data)).toBeLessThanOrEqual(minActions[1]);
      expect(bilge.minActions(data)).toBe(routes(parsePlan(bilge.clue(data)))[0].length);
    }
  });

  it("is crossed blind, without the survey, at most 1 time in 10", () => {
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

  it("shows the Walker only the plates beside them, and a rotten plate returns them to the start", () => {
    let rotten = 0;
    for (const data of draws) {
      const start = walk.start(data);
      const view = walk.view(data, start);
      expect(view.lit.length).toBeGreaterThan(0);
      expect(JSON.stringify(view)).not.toMatch(/trapdoor|rotten|safe|sound|path/i);
      for (const dir of DIRS) {
        const stepped = walk.step(data, start, dir);
        if (stepped.kind === "trapdoor") {
          rotten++;
          expect(stepped.pos).toEqual(start);
        }
      }
      expect(walk.step(data, start, "south").kind).toBe("edge");
    }
    expect(rotten).toBeGreaterThan(draws.length / 2);
  });

  it("varies, and reads back from stored JSON", () => {
    expect(new Set(draws.map((d) => bilge.clue(d))).size).toBeGreaterThan(draws.length / 2);
    expect(bilge.schema.parse(JSON.parse(JSON.stringify(draws[0])))).toEqual(draws[0]);
    expect(() => bilge.schema.parse({ width: 5 })).toThrow();
  });

  it("the Draw picks either middle at random", () => {
    const keys = Array.from({ length: 200 }, (_, i) => generateDraw(seeded(1000 + i)).puzzles[1].key);
    expect(keys.filter((k) => k === "bilge-plates@1").length).toBeGreaterThan(50);
    expect(keys.filter((k) => k === "rotten-floor@1").length).toBeGreaterThan(50);
  });
});
