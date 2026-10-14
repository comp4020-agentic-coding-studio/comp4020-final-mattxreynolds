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
  // #24 gives the finale only its Clue-value bound; the minActions range is a first estimate
  finale: { clueValues: [4, 8], minActions: [4, 12] },
  middle: { clueValues: [8, 14], minActions: [6, 14] },
} as const satisfies Record<string, Band>;
