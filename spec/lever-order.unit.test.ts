import { describe, expect, it } from "vitest";
import { BANDS } from "../server/puzzles/bands.ts";
import { generateDraw } from "../server/draw.ts";
import { puzzle, versionsFor } from "../server/puzzles/index.ts";
import { codeFromClue } from "./helpers/mural.ts";

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

const lever = puzzle("lever-order@1");
const draws = Array.from({ length: 500 }, (_, i) => lever.generate(seeded(i + 1)));
const permutations = (items: string[]): string[][] =>
  items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
const ALL_ORDERS = permutations(["1", "2", "3", "4", "5"]).map((p) => p.join(""));

describe("lever order v1", () => {
  it("sits in the opener slot: the Wheelhouse holds the wiring card, the Engine Room the levers", () => {
    expect(lever.slot).toBe("opener");
    expect(lever.decks).toEqual({ clue: "Upper Deck", lock: "Lower Deck" });
    expect(lever.control).toBe("levers");
  });

  it("is solvable: the rendered Clue text alone implies an order the checker accepts", () => {
    for (const data of draws) expect(lever.check(data, codeFromClue(lever.clue(data)))).toBe(true);
  });

  it("has exactly one answer given its Clues, among every order and other strings", () => {
    for (const data of draws.slice(0, 60)) expect(ALL_ORDERS.filter((o) => lever.check(data, o))).toHaveLength(1);
    for (const bad of ["", "1234", "123456", "11111", "abcde"]) expect(lever.check(draws[0], bad)).toBe(false);
  });

  it("stays within the opener band", () => {
    const { clueValues, minActions } = BANDS.opener;
    for (const data of draws) {
      expect(lever.clueValues(data)).toBeGreaterThanOrEqual(clueValues[0]);
      expect(lever.clueValues(data)).toBeLessThanOrEqual(clueValues[1]);
      expect(lever.minActions(data)).toBeGreaterThanOrEqual(minActions[0]);
      expect(lever.minActions(data)).toBeLessThanOrEqual(minActions[1]);
    }
  });

  it("fails a random order with probability above 0.99", () => {
    const random = seeded(7);
    let wrong = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) {
      const order = [..."12345"].sort(() => random() - 0.5).join("");
      if (!lever.check(draws[i % draws.length], order)) wrong++;
    }
    expect(wrong / trials).toBeGreaterThan(0.99);
  });

  it("varies from one Draw to the next and reads back through its own schema", () => {
    expect(new Set(draws.map((d) => lever.clue(d))).size).toBeGreaterThan(100);
    expect(lever.schema.parse(JSON.parse(JSON.stringify(draws[0])))).toEqual(draws[0]);
    expect(() => lever.schema.parse({ direction: "top", wires: [1, 1, 1, 1, 1] })).toThrow();
  });
});

describe("the opener slot's Draw", () => {
  it("offers two Puzzles in every slot", () => {
    expect(versionsFor("opener").map((v) => v.key).sort()).toEqual(["lever-order@1", "mural-keypad@1"]);
    expect(versionsFor("middle").map((v) => v.key).sort()).toEqual(["bilge-plates@1", "rotten-floor@1"]);
    expect(versionsFor("finale").map((v) => v.key).sort()).toEqual(["helm-telegraph@1", "valves-gauges@1"]);
  });

  it("picks either opener at random, and always one the registry can read back", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const opener = generateDraw(seeded(i + 1)).puzzles.find((p) => p.slot === "opener")!;
      keys.add(opener.key);
      puzzle(opener.key).schema.parse(opener.data);
    }
    expect([...keys].sort()).toEqual(["lever-order@1", "mural-keypad@1"]);
  });
});
