import { z } from "zod";
import type { PuzzleVersion, Rng } from "../types.ts";

// Mural keypad v1. The Wheelhouse mural shows four panels of lanterns, bells,
// anchors or gulls; the Engine Room keypad takes the four counts, read in the
// direction the plaque gives. Stored data is { direction, panels }, listed in
// left to right order.
const MOTIFS = ["lanterns", "bells", "anchors", "gulls"] as const;

const schema = z.strictObject({
  direction: z.enum(["left", "right"]),
  panels: z
    .array(z.strictObject({ motif: z.enum(MOTIFS), count: z.number().int().min(1).max(9) }))
    .length(4),
});
type Data = z.infer<typeof schema>;

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

const answerOf = (d: Data): string => {
  const counts = d.panels.map((p) => p.count);
  return (d.direction === "left" ? counts : counts.reverse()).join("");
};

export const muralKeypadV1: PuzzleVersion<Data> = {
  key: "mural-keypad@1",
  control: "keypad",
  slot: "opener",
  decks: { clue: "Upper Deck", lock: "Lower Deck" },
  schema,
  generate: (rng) => ({
    direction: pick(rng, ["left", "right"] as const),
    panels: Array.from({ length: 4 }, () => ({ motif: pick(rng, MOTIFS), count: 1 + Math.floor(rng() * 9) })),
  }),
  clue: (d) =>
    [`The brass plate says to read the mural from the ${d.direction}.`, ...d.panels.map((p, i) => `Panel ${i + 1}: ${p.count} ${p.motif}`)].join("\n"),
  check: (d, answer) => answer === answerOf(d),
  // four counts, plus the reading direction
  clueValues: (d) => d.panels.length + 1,
  // four digits, then enter
  minActions: (d) => d.panels.length + 1,
};
