import { z } from "zod";
import type { PuzzleVersion, Rng } from "../types.ts";

// Lever order v1 (#62), the opener's second Puzzle. The Wheelhouse wiring card
// lists five wires, top to bottom, each naming the lever it runs to; the card
// says whether to pull from the top down or the bottom up. The Engine Room
// pulls the five levers in that order and presses set. Stored data is
// { direction, wires }: wires[i] is the lever (1 to 5) on wire i + 1, a
// permutation, so exactly one order is right.
const LEVERS = 5;

const schema = z
  .strictObject({
    direction: z.enum(["top", "bottom"]),
    wires: z.array(z.number().int().min(1).max(LEVERS)).length(LEVERS),
  })
  .refine((d) => new Set(d.wires).size === LEVERS, "each lever is on exactly one wire");
type Data = z.infer<typeof schema>;

const answerOf = (d: Data): string => (d.direction === "top" ? d.wires : [...d.wires].reverse()).join("");

export const leverOrderV1: PuzzleVersion<Data> = {
  key: "lever-order@1",
  slot: "opener",
  control: "levers",
  decks: { clue: "Upper Deck", lock: "Lower Deck" },
  schema,
  generate: (rng: Rng) => {
    const wires = Array.from({ length: LEVERS }, (_, i) => i + 1);
    for (let i = wires.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [wires[i], wires[j]] = [wires[j], wires[i]];
    }
    return { direction: rng() < 0.5 ? "top" : "bottom", wires };
  },
  clue: (d) =>
    [
      `The wiring card says to pull the levers from the ${d.direction} ${d.direction === "top" ? "down" : "up"}.`,
      ...d.wires.map((lever, i) => `Wire ${i + 1}: lever ${lever}`),
    ].join("\n"),
  check: (d, answer) => answer === answerOf(d),
  // five wires, plus the reading direction
  clueValues: (d) => d.wires.length + 1,
  // five pulls, then set
  minActions: (d) => d.wires.length + 1,
};
