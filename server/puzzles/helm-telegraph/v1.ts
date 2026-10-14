import { z } from "zod";
import type { Instrument, PuzzleVersion, Rng, Settings } from "../types.ts";

// Helm and telegraph v1 (the finale's Puzzle B, #64). The Engine Room sets the
// engine speed on the telegraph (the instrument's one "valve"); the Wheelhouse
// steers the helm (its one "trim") and reads the heading and the speed. Speed
// is the telegraph stop times the knots per stop. Heading is the helm plus the
// current's push, which grows with every stop. Only the Wheelhouse holds the
// targets and both rules. Generation keeps only instances where the telegraph
// stop and the helm both start wrong, so neither Deck can finish alone, and
// exactly one (stop, helm) pair is in band.
const STOPS = [0, 8] as const;
const HELM = [-6, 6] as const;
const SPEED_BAND = 2; // the speed target covers this many knots

const schema = z.strictObject({
  /** Degrees the current pushes the heading per telegraph stop. */
  current: z.number().int().min(1).max(3),
  /** Knots the ship makes per telegraph stop. */
  knots: z.number().int().min(2).max(3),
  heading: z.number().int(),
  speedLo: z.number().int(),
  start: z.strictObject({ stop: z.number().int(), helm: z.number().int() }),
});
type Data = z.infer<typeof schema>;

const int = (rng: Rng, [min, max]: readonly [number, number]): number => min + Math.floor(rng() * (max - min + 1));
const readings = (d: Data, s: Settings): number[] => [s.trims[0] + d.current * s.valves[0], d.knots * s.valves[0]];
const inBand = (d: Data, s: Settings): boolean => {
  if (s.valves.length !== 1 || s.trims.length !== 1) return false;
  const [heading, speed] = readings(d, s);
  return heading === d.heading && speed >= d.speedLo && speed < d.speedLo + SPEED_BAND;
};

const instrument: Instrument<Data> = {
  limits: { valves: STOPS, trims: HELM },
  initial: (d) => ({ valves: [d.start.stop], trims: [d.start.helm] }),
  inBand,
  readings,
  names: { valves: "Telegraph", trims: "Helm", gauges: ["Heading", "Speed"] },
};

const isSettings = (x: unknown): x is Settings =>
  typeof x === "object" &&
  x !== null &&
  [(x as Settings).valves, (x as Settings).trims].every((a) => Array.isArray(a) && a.every((n) => Number.isInteger(n)));

/** The notches the two Decks must turn between the start and the one answer. */
const distance = (d: Data, stop: number, helm: number): number => Math.abs(stop - d.start.stop) + Math.abs(helm - d.start.helm);

export const helmTelegraphV1: PuzzleVersion<Data> = {
  key: "helm-telegraph@1",
  slot: "finale",
  decks: { clue: "Upper Deck", lock: "Lower Deck" },
  schema,
  generate: (rng) => {
    for (;;) {
      const current = 1 + Math.floor(rng() * 3);
      const knots = 2 + Math.floor(rng() * 2);
      // the answer is a stop that makes some speed (not stopped) and a helm angle off the start
      const stop = int(rng, [1, STOPS[1]]);
      const helm = int(rng, HELM);
      const start = { stop: int(rng, STOPS), helm: int(rng, HELM) };
      const d: Data = { current, knots, heading: helm + current * stop, speedLo: knots * stop - Math.floor(rng() * SPEED_BAND), start };
      // both dials must start wrong, so neither Deck alone reaches the band; the notch count stays in the finale band
      const total = distance(d, stop, helm);
      if (start.stop !== stop && start.helm !== helm && total >= 4 && total <= 12) return d;
    }
  },
  clue: (d) =>
    [
      `The current pushes the heading ${d.current} degrees for every telegraph stop. The ship makes ${d.knots} knots for every telegraph stop.`,
      `The Engine Room telegraph runs ${STOPS[0]} to ${STOPS[1]}. The Wheelhouse helm runs ${HELM[0]} to ${HELM[1]}. The heading reads the helm plus the current's push.`,
      `Heading target: ${d.heading}`,
      `Speed target: ${d.speedLo} to ${d.speedLo + SPEED_BAND - 1} knots`,
    ].join("\n"),
  // an answer here is settings as JSON; the live instrument never goes through it
  check: (d, answer) => {
    try {
      const parsed: unknown = JSON.parse(answer);
      return isSettings(parsed) && inBand(d, parsed);
    } catch {
      return false;
    }
  },
  // the current, the knots, the heading target and the speed target
  clueValues: () => 4,
  minActions: (d) => {
    // the one in-band pair, found from the targets alone
    for (let stop = STOPS[0]; stop <= STOPS[1]; stop++) {
      for (let helm = HELM[0]; helm <= HELM[1]; helm++) if (inBand(d, { valves: [stop], trims: [helm] })) return distance(d, stop, helm);
    }
    throw new Error("helm-telegraph data with no answer");
  },
  instrument,
};
