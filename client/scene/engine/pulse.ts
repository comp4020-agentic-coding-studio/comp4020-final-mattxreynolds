// Pulse-lamp timing for the answering station's pattern (PUZZLES.md 3b).
// Exported so audio can beep in exactly the same rhythm as the lamp.

import type { Pulse } from "../../../shared/glyphs.ts";

export const PULSE_TIMING = {
  /** lamp on for a short pulse */
  shortMs: 250,
  /** lamp on for a long pulse */
  longMs: 750,
  /** dark gap between pulses within one repeat */
  gapMs: 300,
  /** dark pause before the pattern repeats */
  repeatGapMs: 1600,
} as const;

/** Total length of one repeat of `pattern`, including the trailing pause. */
export function pulseCycleMs(pattern: Pulse): number {
  const on = pattern.reduce((n, long) => n + (long ? PULSE_TIMING.longMs : PULSE_TIMING.shortMs), 0);
  return on + PULSE_TIMING.gapMs * Math.max(0, pattern.length - 1) + PULSE_TIMING.repeatGapMs;
}

/** Which pulse (index) is lit at time `ms`, or -1 if the lamp is dark. */
export function pulseAt(pattern: Pulse, ms: number): number {
  if (pattern.length === 0) return -1;
  let t = ms % pulseCycleMs(pattern);
  for (let i = 0; i < pattern.length; i++) {
    const on = pattern[i] ? PULSE_TIMING.longMs : PULSE_TIMING.shortMs;
    if (t < on) return i;
    t -= on + PULSE_TIMING.gapMs;
    if (t < 0) return -1;
  }
  return -1;
}
