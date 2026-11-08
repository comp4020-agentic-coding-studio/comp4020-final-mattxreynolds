// How much the high tier glows (ADR 007). Bloom (PostFX.tsx) picks up only
// pixels brighter than BLOOM.threshold, so what glows is decided by which
// materials can get that bright:
//  - labels and dial faces must never reach it (their white text haloed);
//  - ceiling lights, lamps and screens may, a little.
// Client-only presentation numbers: nothing on the server reads them.

export const BLOOM = {
  /** HDR luminance a pixel needs before it blooms */
  threshold: 1.25,
  /** strength of the glow around what passes (× grade.bloom for storm flashes) */
  strength: 0.32,
  radius: 0.35,
} as const;

/** Self-light for labels and dial faces: enough to read them in the dark
 * prologue, never enough for white paint to cross BLOOM.threshold even next
 * to a working lamp. A "lit" plate (TRIPPED, ARMED) still reads as lit from
 * its colours; at the old 0.9–1.1 its white text bloomed. */
export const LABEL_GLOW_MAX = 0.3;
export const labelGlow = (g: number): number => Math.min(LABEL_GLOW_MAX, g);

/** Peak HDR brightness of the Engine Room's fluorescent tubes at full power
 * (was 2.95: a wide flare across the deckhead). */
export const TUBE_PEAK = 2.2;
