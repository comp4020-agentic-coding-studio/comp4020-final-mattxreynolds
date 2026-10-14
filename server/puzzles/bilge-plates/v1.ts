import { z } from "zod";
import type { WalkDir } from "../../../shared/intents.ts";
import type { Pos, PuzzleVersion, Rng, StepResult } from "../types.ts";

// Bilge plates v1. The middle slot's other Puzzle (#63): the same blind
// navigator mechanics as the rotten floor, on the Wheelhouse's dark floor, but
// the Engine Room reads a survey that names the sound plates row by row
// instead of drawing a grid. Plates are `width` by `height`, columns lettered
// from A and rows numbered from 1 at the start row. Stored data is
// { width, height, path }: the one sound route from the start row to the far
// row. Every other plate is rotten, and the route never touches itself, so it
// is the only way across.
const WIDTH = 5;
const HEIGHT = 6;
const MIN_STEPS = 8;
const MAX_STEPS = 12;

const schema = z.strictObject({
  width: z.number().int().min(2).max(9),
  height: z.number().int().min(2).max(9),
  path: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(2),
});
type Data = z.infer<typeof schema>;

const DELTA: Record<WalkDir, Pos> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
const DIRS = Object.keys(DELTA) as WalkDir[];
const plate = ([x, y]: Pos): string => `${String.fromCharCode(65 + x)}${y + 1}`;
const same = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1];
const adjacent = (a: Pos, b: Pos): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const onFloor = (d: Data, [x, y]: Pos): boolean => x >= 0 && y >= 0 && x < d.width && y < d.height;
const isSound = (d: Data, p: Pos): boolean => d.path.some((q) => same(p, q));

/** A random induced path from the start row up to the first plate of the far row, or null on a dead end. */
function attempt(rng: Rng): Pos[] | null {
  const path: Pos[] = [[Math.floor(rng() * WIDTH), 0]];
  while (path[path.length - 1][1] < HEIGHT - 1) {
    const at = path[path.length - 1];
    const options = DIRS.map((dir): Pos => [at[0] + DELTA[dir][0], at[1] + DELTA[dir][1]]).filter(
      (n) =>
        n[0] >= 0 && n[0] < WIDTH && n[1] >= 0 && n[1] < HEIGHT &&
        // never beside an earlier plate, so no shortcut exists
        !path.slice(0, -1).some((v) => adjacent(n, v)) &&
        !path.some((v) => same(n, v)),
    );
    if (options.length === 0 || path.length > MAX_STEPS) return null;
    path.push(options[Math.floor(rng() * options.length)]);
  }
  return path.length - 1 >= MIN_STEPS ? path : null;
}

export const bilgePlatesV1: PuzzleVersion<Data> = {
  key: "bilge-plates@1",
  slot: "middle",
  decks: { clue: "Lower Deck", lock: "Upper Deck" },
  schema,
  generate: (rng) => {
    for (;;) {
      const path = attempt(rng);
      if (path) return { width: WIDTH, height: HEIGHT, path };
    }
  },
  clue: (d) => {
    const rows = Array.from({ length: d.height }, (_, y) => {
      const sound = d.path.filter((p) => p[1] === y).sort((a, b) => a[0] - b[0]).map(plate);
      return `In row ${y + 1}, only ${sound.join(" and ")} bear weight.`;
    });
    return [
      `Bilge survey: ${d.width} plates wide, columns A to ${String.fromCharCode(64 + d.width)}, and ${d.height} rows deep.`,
      `Start on ${plate(d.path[0])}. The far side is row ${d.height}.`,
      "Every plate not named is rotten.",
      ...rows,
    ].join("\n");
  },
  // a walking Puzzle takes no typed answer
  check: () => false,
  // every sound plate on the route crosses Decks
  clueValues: (d) => d.path.length,
  minActions: (d) => d.path.length - 1,
  walk: {
    start: (d) => d.path[0],
    step: (d, pos, dir): StepResult => {
      const next: Pos = [pos[0] + DELTA[dir][0], pos[1] + DELTA[dir][1]];
      if (!onFloor(d, next)) return { kind: "edge", pos };
      if (!isSound(d, next)) return { kind: "trapdoor", pos: d.path[0] };
      return { kind: next[1] === d.height - 1 ? "far-side" : "moved", pos: next };
    },
    // every plate beside the Walker is lit, so the view says nothing about which are sound
    view: (d, pos) => ({
      at: plate(pos),
      lit: DIRS.map((dir) => ({ dir, next: [pos[0] + DELTA[dir][0], pos[1] + DELTA[dir][1]] as Pos }))
        .filter(({ next }) => onFloor(d, next))
        .map(({ dir, next }) => ({ dir, tile: plate(next) })),
    }),
  },
};
