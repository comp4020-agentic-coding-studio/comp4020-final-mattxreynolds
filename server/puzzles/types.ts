import type { ZodType } from "zod";
import type { DeckName } from "../../shared/intents.ts";
import type { Slot } from "../../shared/draw.ts";

/** Random numbers in [0, 1). Generators take one so a spec can replay a Draw. */
export type Rng = () => number;

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
}
