import type { ZodType } from "zod";
import type { DeckName, WalkDir } from "../../shared/intents.ts";
import type { Slot, WalkView } from "../../shared/draw.ts";

/** Random numbers in [0, 1). Generators take one so a spec can replay a Draw. */
export type Rng = () => number;

/** The settings of a split instrument: one valve level and one trim per gauge. */
export interface Settings {
  valves: number[];
  trims: number[];
}

/**
 * A finale's shared instrument (#24): live state that both Decks change, held
 * in band for 10 s. The Puzzle's stored data fixes the target; the state moves.
 */
export interface Instrument<D = unknown> {
  limits: { valves: readonly [number, number]; trims: readonly [number, number] };
  initial(data: D): Settings;
  inBand(data: D, settings: Settings): boolean;
  /** What each gauge reads for these settings, for the Deck that reads gauges. */
  readings(data: D, settings: Settings): number[];
}

/**
 * One Puzzle version (ADR 0001, ADR 0007). Its stored data `D` is a contract:
 * changing the shape or meaning of `D` is a new version file, and the old one
 * stays registered. Nothing in this interface may be imported by client/.
 */
export interface PuzzleVersion<D = unknown> {
  /** `"id@v"`, the registry key. */
  readonly key: string;
  readonly slot: Slot;
  /** Which Deck holds the Clue and which takes the answer. */
  readonly decks: { clue: DeckName; lock: DeckName };
  /** Validates data read back from storage. */
  readonly schema: ZodType<D>;
  generate(rng: Rng): D;
  /** The Clue text, rendered from the same data `check` reads. */
  clue(data: D): string;
  check(data: D, answer: string): boolean;
  /** Band inputs (#24): Clue values that cross Decks, and the fewest actions a solve needs. */
  clueValues(data: D): number;
  minActions(data: D): number;
  /** Present only on a split instrument, which takes live settings, not a typed answer. */
  readonly instrument?: Instrument<D>;
  /** Present on blind navigator Puzzles: the Walker's rules, in place of a submitted answer. */
  readonly walk?: WalkRules<D>;
}

export type Pos = [number, number];

/** Where a step lands: "edge" is no step at all, "trapdoor" returns `pos` to the start. */
export interface StepResult {
  kind: "moved" | "far-side" | "trapdoor" | "edge";
  pos: Pos;
}

export interface WalkRules<D> {
  start(data: D): Pos;
  step(data: D, pos: Pos, dir: WalkDir): StepResult;
  /** What the Walker sees at `pos`: never which tiles are trapdoors. */
  view(data: D, pos: Pos): WalkView;
}
