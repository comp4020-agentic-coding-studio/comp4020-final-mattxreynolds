import { z } from "zod";
import type { Instrument, PuzzleVersion, Rng, Settings } from "../types.ts";

// Valves and gauges v1 (the finale's Puzzle A). Three gauges each read
// `step * valve + trim`. The Engine Room turns the valves; the Wheelhouse sets
// the trims and reads the gauges, and only the Wheelhouse holds the targets and
// the step. Stored data is the step, each gauge's target band and where its
// valve and trim start. Generation rejects any instance either Deck could
// finish alone, so the launch is a joint action by construction.
const GAUGES = 3;
const VALVES = [0, 9] as const;
const TRIMS = [-4, 4] as const;
const BAND_WIDTH = 2; // a target covers this many readings

const schema = z.strictObject({
  step: z.number().int().min(2).max(3),
  gauges: z
    .array(z.strictObject({ lo: z.number().int(), start: z.strictObject({ valve: z.number().int(), trim: z.number().int() }) }))
    .length(GAUGES),
});
type Data = z.infer<typeof schema>;

const int = (rng: Rng, [min, max]: readonly [number, number]): number => min + Math.floor(rng() * (max - min + 1));
const range = ([min, max]: readonly [number, number]): number[] => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const reading = (d: Data, valve: number, trim: number): number => d.step * valve + trim;
const gaugeIn = (d: Data, i: number, valve: number, trim: number): boolean => {
  const r = reading(d, valve, trim);
  return r >= d.gauges[i].lo && r < d.gauges[i].lo + BAND_WIDTH;
};

const inBand = (d: Data, s: Settings): boolean =>
  s.valves.length === GAUGES && s.trims.length === GAUGES && d.gauges.every((_, i) => gaugeIn(d, i, s.valves[i], s.trims[i]));

const initial = (d: Data): Settings => ({ valves: d.gauges.map((g) => g.start.valve), trims: d.gauges.map((g) => g.start.trim) });

const instrument: Instrument<Data> = {
  limits: { valves: VALVES, trims: TRIMS },
  initial,
  inBand,
  readings: (d, s) => d.gauges.map((_, i) => reading(d, s.valves[i], s.trims[i])),
};

const isSettings = (x: unknown): x is Settings =>
  typeof x === "object" &&
  x !== null &&
  [(x as Settings).valves, (x as Settings).trims].every((a) => Array.isArray(a) && a.every((n) => Number.isInteger(n)));

export const valvesGaugesV1: PuzzleVersion<Data> = {
  key: "valves-gauges@1",
  slot: "finale",
  decks: { clue: "Upper Deck", lock: "Lower Deck" },
  schema,
  generate: (rng) => {
    for (;;) {
      const step = 2 + Math.floor(rng() * 2);
      const gauges = Array.from({ length: GAUGES }, () => {
        const target = step * int(rng, VALVES) + int(rng, TRIMS);
        return { lo: target - Math.floor(rng() * BAND_WIDTH), start: { valve: int(rng, VALVES), trim: int(rng, TRIMS) } };
      });
      const d: Data = { step, gauges };
      // each target was built from a valve and a trim, so it is reachable; keep only instances that
      // neither the valves alone nor the trims alone can finish
      const valvesAlone = d.gauges.every((g, i) => range(VALVES).some((v) => gaugeIn(d, i, v, g.start.trim)));
      const trimsAlone = d.gauges.every((g, i) => range(TRIMS).some((t) => gaugeIn(d, i, g.start.valve, t)));
      if (!valvesAlone && !trimsAlone) return d;
    }
  },
  clue: (d) =>
    [
      `Each gauge reads its valve level times the valve step, plus its trim. The valve step moves its gauge by ${d.step} per notch.`,
      `The Engine Room valves run ${VALVES[0]} to ${VALVES[1]}. The Wheelhouse trims run ${TRIMS[0]} to ${TRIMS[1]}.`,
      ...d.gauges.map((g, i) => `Gauge ${i + 1}: target ${g.lo} to ${g.lo + BAND_WIDTH - 1}`),
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
  // the step and each gauge's target band
  clueValues: (d) => 1 + d.gauges.length,
  // one valve and one trim per gauge
  minActions: (d) => 2 * d.gauges.length,
  instrument,
};
