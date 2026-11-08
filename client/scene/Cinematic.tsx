// Cinematic bookends, procedural and real-time: a storm at night over a
// moving sea, the MV Kestrel Meridian riding it.
//   intro    — establishing silhouette, a run along the hull through heavy
//              seas, the other ship's lights out of the rain, the collision,
//              power failing to emergency red, a push-in to the bridge
//   survived — the lifeboat lowered on its falls, released, pulling away as
//              the ship goes down by the head; the storm breaks to dawn
//   lost     — emergency red on deck, the sea climbing the superstructure,
//              lights dying aft, the last of her slipping under, to black
// The shot list, timings and events live in cinematic/timeline.ts; the scene
// in cinematic/CinematicScene.tsx. Reduced motion: no lightning strobe, no
// camera shake or handheld drift, gentler swell, softer rain, and lights
// fade instead of flickering.

import { type Sequence, sequenceSeconds, T_HIT } from "./cinematic/timeline.ts";

export { CinematicScene, cinematicTime } from "./cinematic/CinematicScene.tsx";
export type Shot = Sequence;

export const SHOT_SECONDS: Record<Shot, number> = {
  intro: sequenceSeconds("intro"),
  survived: sequenceSeconds("survived"),
  lost: sequenceSeconds("lost"),
};

/** Caption cards, timed in seconds from the start of the sequence. */
export const CAPTIONS: Record<Shot, { at: number; until: number; text: string; big?: boolean }[]> = {
  intro: [
    { at: 1.2, until: 6.0, text: "MV KESTREL MERIDIAN · HALVARD COASTAL LINES", big: true },
    { at: 7.0, until: 11.5, text: "Bass Strait. 02:14. Heavy weather." },
    { at: 13.0, until: 17.2, text: "A ship's lights, fine on the starboard bow. Closing." },
    { at: T(0.6), until: T(4.6), text: "Collision — starboard bow" },
    { at: T(5.4), until: T(9.6), text: "Main power lost. The sea is coming in." },
    { at: T(10.4), until: T(13.6), text: "Two crew are still aboard.", big: true },
  ],
  survived: [
    { at: 1.0, until: 5.0, text: "The lifeboat drops clear.", big: true },
    { at: 11.0, until: 15.2, text: "Behind you, the Kestrel Meridian goes down by the head." },
    { at: 15.8, until: 19.8, text: "Dawn. Somewhere out there, a station has your position." },
  ],
  lost: [
    { at: 1.0, until: 6.5, text: "The lights go out below the waterline.", big: true },
    { at: 9.0, until: 12.4, text: "MV Kestrel Meridian. Lost with all hands." },
  ],
};

/** Seconds after the collision. */
function T(after: number): number {
  return T_HIT + after;
}
