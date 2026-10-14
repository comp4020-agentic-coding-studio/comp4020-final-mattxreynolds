// Difficulty bands per slot, from #24 (first estimates, tuned by playtests).
// Each ticket that adds a slot's Puzzle adds its band here.
export interface Band {
  /** How many Clue values cross Decks, inclusive. */
  clueValues: readonly [number, number];
  /** The fewest actions a solve takes, inclusive. */
  minActions: readonly [number, number];
}

export const BANDS = {
  opener: { clueValues: [5, 8], minActions: [4, 8] },
} as const satisfies Record<string, Band>;
