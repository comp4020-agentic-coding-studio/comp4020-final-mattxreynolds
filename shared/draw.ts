// Wire types for a Draw (ADR 0001, ADR 0007). This is the PublicDraw side of
// the split: what one Deck may see. The stored shape, with answers, is
// StoredDraw under server/ and cannot be imported from here.
import type { DeckName, WalkDir } from "./intents.ts";

export const SLOTS = ["opener", "middle", "finale"] as const;
export type Slot = (typeof SLOTS)[number];

/** Strictly sequential: only the live Puzzle's stations work; later ones are visible but dead. */
export type PuzzleStatus = "live" | "dead" | "solved";

export interface PublicPuzzle {
  slot: Slot;
  status: PuzzleStatus;
  /** "clue" on the Deck that holds the Clue, "lock" on the Deck that takes the answer, null while the slot has no Puzzle yet. */
  role: "clue" | "lock" | null;
  /** The rendered Clue; present only on the Clue Deck, and only once the Puzzle is live or solved. */
  clue?: string;
  /** The Walker's view, on the walking Deck only, while the Puzzle is live: where they stand and the lit tiles beside them. */
  walk?: WalkView;
}

export interface WalkView {
  at: string;
  lit: { dir: WalkDir; tile: string }[];
}

export interface PublicDraw {
  deck: DeckName;
  puzzles: PublicPuzzle[];
  /** Strikes belong to the Voyage; nothing here says who gave one. */
  strikes: number;
}

/** A one-off notice sent to both Decks as its own SSE event, right after the snapshot it belongs to. */
export type Notice = { event: "bell"; data: { slot: Slot } } | { event: "strike"; data: { strikes: number } };
