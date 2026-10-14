import { describe, expect, it } from "vitest";
import { BANDS } from "../server/puzzles/bands.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { puzzle } from "../server/puzzles/index.ts";

// A seeded generator, so a failure here replays.
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
const mural = puzzle("mural-keypad@1");
const draws = Array.from({ length: INSTANCES }, (_, i) => mural.generate(seeded(i + 1)));

describe("mural keypad v1", () => {
  it("is solvable: the rendered Clue text alone implies a code the checker accepts", () => {
    for (const data of draws) expect(mural.check(data, codeFromClue(mural.clue(data)))).toBe(true);
  });

  it("has exactly one answer given its Clues", () => {
    for (const data of draws.slice(0, 30)) {
      const accepted = Array.from({ length: 10_000 }, (_, n) => String(n).padStart(4, "0")).filter((c) => mural.check(data, c));
      expect(accepted).toHaveLength(1);
    }
  });

  it("stays within the opener band on cross-Deck Clue values and minimum actions", () => {
    expect(mural.slot).toBe("opener");
    const { clueValues, minActions } = BANDS.opener;
    for (const data of draws) {
      expect(mural.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(mural.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(mural.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(mural.minActions(data)).toBeLessThanOrEqual(minActions[1]);
    }
    // the opener band is 5 to 8 Clue values (#24)
    expect(clueValues).toEqual([5, 8]);
  });

  it("fails a random code with probability above 0.99", () => {
    const random = seeded(99);
    let wrong = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) {
      const guess = String(Math.floor(random() * 10_000)).padStart(4, "0");
      if (!mural.check(draws[i % draws.length], guess)) wrong++;
    }
    expect(wrong / trials).toBeGreaterThan(0.99);
  });

  it("rejects anything that is not four digits", () => {
    const answer = codeFromClue(mural.clue(draws[0]));
    for (const bad of ["", answer.slice(0, 3), `${answer}0`, "abcd", ` ${answer}`]) expect(mural.check(draws[0], bad)).toBe(false);
  });

  it("varies from one Draw to the next", () => {
    expect(new Set(draws.map((d) => mural.clue(d))).size).toBeGreaterThan(INSTANCES / 2);
  });

  it("reads back from stored JSON through its own schema", () => {
    const stored = JSON.parse(JSON.stringify(draws[0])) as unknown;
    expect(mural.schema.parse(stored)).toEqual(draws[0]);
    expect(() => mural.schema.parse({ panels: [] })).toThrow();
  });
});

describe("the registry", () => {
  it("looks a Puzzle version up by its id@v key and refuses an unknown one", () => {
    expect(puzzle("mural-keypad@1").key).toBe("mural-keypad@1");
    expect(() => puzzle("mural-keypad@99")).toThrow(/unknown Puzzle/);
  });
});
