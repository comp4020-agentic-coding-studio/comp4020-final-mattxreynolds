// The cinematics as data: each sequence is a list of camera shots (eased
// keyframe paths in a chosen frame of reference) plus timed events —
// lightning, spray bursts, shakes, sound cues. Pacing lives here, not in the
// scene code, so a shot can be retimed by editing one number.

import { CatmullRomCurve3, Vector3 } from "three";

export type Sequence = "intro" | "survived" | "lost";

/** Where a shot's keyframes are measured from.
 * world — fixed; ship — follows the ship's position (not its roll);
 * rigid — bolted to the ship, rolls with it; boat — follows the lifeboat;
 * other — follows the other vessel. */
export type Frame = "world" | "ship" | "rigid" | "boat" | "other";
export type Key = [number, number, number];
export type Ease = "inout" | "in" | "out" | "linear";

export type CamShot = {
  name: string;
  dur: number;
  frame: Frame;
  pos: Key[];
  look: Key[];
  lookFrame?: Frame;
  /** lens field of view (degrees) at the start and the end of the shot */
  fov: [number, number];
  ease?: Ease;
  /** handheld drift amplitude (world units) */
  hand?: number;
  /** how this shot begins: a hard cut, a dip through black, or a white flash */
  enter?: "cut" | "dip" | "flash";
};

export type Strike = { at: number; /** bolt bearing relative to the lens (radians) */ ang: number };
export type Spray = { at: number; anchor: "bow" | "impact" | "boat" | "stern"; power: number };
export type Cue = { at: number; cue: "horn" | "impact" | "thunder" | "splash" | "groan" | "alarm" };

export type SequenceDef = {
  shots: CamShot[];
  strikes: Strike[];
  sprays: Spray[];
  cues: Cue[];
  /** camera shake impulses: amplitude, decays over ~1 s */
  shakes: { at: number; amp: number }[];
  /** fade to black over the last `fadeOut` seconds */
  fadeOut: number;
};

/** The intro's moment of impact (seconds). Everything after keys off it. */
export const T_HIT = 19.4;

export const SEQUENCES: Record<Sequence, SequenceDef> = {
  intro: {
    shots: [
      {
        // a lone silhouette against the lit horizon, lightning behind her
        name: "establishing",
        dur: 6.5,
        frame: "ship",
        pos: [[-30, 1.6, 34], [-24, 1.9, 30]],
        look: [[-1, 3.6, 0], [1, 3.4, 0]],
        fov: [32, 30],
        hand: 0.25,
        enter: "dip",
      },
      {
        // low along the starboard side toward the bow as she slams into a sea
        name: "hull-track",
        dur: 5.5,
        frame: "ship",
        pos: [[-8, 1.0, 9.6], [-3, 1.1, 9.3], [2, 1.3, 9.0]],
        look: [[10, 2.0, 1.6], [12, 2.2, 1.2], [14, 2.4, 0.8]],
        fov: [42, 40],
        ease: "linear",
        hand: 0.18,
        enter: "dip",
      },
      {
        // from the starboard bridge wing: lights out in the rain, red and green both
        name: "bridge-wing",
        dur: 5.4,
        frame: "rigid",
        pos: [[-6.4, 6.6, 3.0], [-6.1, 6.55, 2.9]],
        look: [[20, 3.0, 16], [21, 3.0, 13.5]],
        lookFrame: "ship",
        fov: [38, 32],
        hand: 0.05,
        enter: "dip",
      },
      {
        // ahead and low: her bow comes out of the rain into ours
        name: "impact",
        dur: 4.4,
        frame: "ship",
        pos: [[30, 2.2, -3], [27, 2.0, -2]],
        look: [[9, 2.8, 5], [9, 2.4, 4.5]],
        fov: [36, 33],
        hand: 0.08,
        enter: "cut",
      },
      {
        // pulled back: the other ship drifts off, our lights die section by section
        name: "aftermath",
        dur: 5.2,
        frame: "ship",
        pos: [[-22, 2.0, 20], [-17, 1.7, 17]],
        look: [[3, 2.6, 2], [1, 2.4, 1]],
        fov: [38, 36],
        hand: 0.2,
        enter: "dip",
      },
      {
        // push in on the red-lit bridge windows and hold there as it fades
        name: "push-in",
        dur: 4.6,
        frame: "rigid",
        pos: [[8, 8.6, 9], [2.6, 7.0, 4.6], [0.4, 5.9, 2.6]],
        look: [[-7, 5.8, 0], [-7, 5.7, 0], [-7, 5.6, -0.3]],
        fov: [40, 30],
        // eases out, so the last lit frame holds on the raked glass as it fades
        ease: "inout",
        hand: 0.06,
        enter: "dip",
      },
    ],
    strikes: [
      { at: 1.6, ang: 0.08 },
      { at: 4.7, ang: -0.18 },
      { at: 9.6, ang: 0.3 },
      { at: 15.2, ang: -0.12 },
      { at: T_HIT + 0.05, ang: 0.25 },
      { at: 24.3, ang: -0.3 },
    ],
    sprays: [
      { at: 8.2, anchor: "bow", power: 1 },
      { at: 10.7, anchor: "bow", power: 1.2 },
      { at: 17.6, anchor: "bow", power: 0.8 },
      { at: T_HIT, anchor: "impact", power: 1.6 },
    ],
    cues: [
      { at: 1.7, cue: "thunder" },
      { at: 8.2, cue: "splash" },
      { at: 10.7, cue: "splash" },
      { at: 14.4, cue: "horn" },
      { at: 16.6, cue: "horn" },
      { at: T_HIT, cue: "impact" },
      { at: T_HIT + 1.2, cue: "groan" },
      { at: T_HIT + 3, cue: "alarm" },
    ],
    shakes: [
      { at: 8.2, amp: 0.15 },
      { at: 10.7, amp: 0.2 },
      { at: T_HIT, amp: 1.1 },
    ],
    fadeOut: 1.4,
  },
  survived: {
    shots: [
      {
        // the lifeboat comes down the ship's side on its falls
        name: "davits",
        dur: 5.2,
        frame: "ship",
        pos: [[-1.5, 3.8, 11], [-2.5, 2.4, 10.5]],
        look: [[-8, 3.4, 3], [-8, 1.2, 3.4]],
        fov: [38, 40],
        hand: 0.12,
        enter: "dip",
      },
      {
        // from the water behind the boat as it pulls clear of the listing hull
        name: "pull-away",
        dur: 5.3,
        frame: "boat",
        pos: [[3.6, 2.1, 6.4], [5.0, 2.4, 8.6]],
        look: [[-1.4, 0.9, -3.5], [-2, 1.2, -5]],
        fov: [42, 40],
        hand: 0.18,
        enter: "dip",
      },
      {
        // wide: the Kestrel Meridian slips under by the head, lights failing
        name: "settle",
        dur: 5.0,
        frame: "world",
        pos: [[-15, 1.5, 26], [-13, 1.4, 24]],
        look: [[-3, 1.8, 4], [-3, 0.6, 4]],
        fov: [32, 30],
        hand: 0.15,
        enter: "dip",
      },
      {
        // dawn: the small boat, alone
        name: "dawn",
        dur: 4.5,
        frame: "boat",
        pos: [[-5, 1.8, 6.5], [-9, 3.4, 11]],
        look: [[0, 0.6, 0], [1, 0.8, -3]],
        fov: [36, 34],
        hand: 0.06,
        enter: "dip",
      },
    ],
    strikes: [
      { at: 2.6, ang: -0.25 },
      { at: 9.4, ang: 0.3 },
    ],
    sprays: [{ at: 4.3, anchor: "boat", power: 1 }],
    cues: [
      { at: 4.3, cue: "splash" },
      { at: 2.7, cue: "thunder" },
      { at: 12.5, cue: "groan" },
    ],
    shakes: [],
    fadeOut: 1.2,
  },
  lost: {
    shots: [
      {
        // on deck in the red: the bridge front above, the deck heeling away
        name: "red-deck",
        dur: 4.2,
        frame: "rigid",
        // starboard of the hatches, so the port crane posts fall outside frame right
        pos: [[5.4, 3.5, 3.6], [4.6, 3.4, 3.5]],
        look: [[-7, 4.9, 2.4], [-7, 5.1, 2.4]],
        fov: [40, 37],
        hand: 0.1,
        enter: "dip",
      },
      {
        // level with the sea as it climbs the superstructure
        name: "waterline",
        dur: 4.4,
        frame: "ship",
        pos: [[-1, 1.0, 20], [-3, 0.9, 18]],
        look: [[-6, 1.6, 0], [-7, 1.4, 0]],
        fov: [40, 36],
        hand: 0.16,
        enter: "dip",
      },
      {
        // low on the water, far off: the last of her goes down
        name: "sink",
        dur: 4.6,
        frame: "world",
        pos: [[-16, 0.7, 20], [-15, 0.6, 19]],
        look: [[-5, 1.8, 0], [-5, 0.6, 0]],
        fov: [32, 30],
        hand: 0.12,
        enter: "dip",
      },
    ],
    strikes: [
      { at: 0.6, ang: 0.3 },
      { at: 5.4, ang: -0.2 },
      { at: 10.2, ang: 0.15 },
    ],
    sprays: [],
    cues: [
      { at: 0.2, cue: "alarm" },
      { at: 0.7, cue: "thunder" },
      { at: 4.6, cue: "groan" },
      { at: 9, cue: "groan" },
    ],
    shakes: [{ at: 4.6, amp: 0.25 }],
    fadeOut: 2.2,
  },
};

export const sequenceSeconds = (s: Sequence): number => SEQUENCES[s].shots.reduce((a, sh) => a + sh.dur, 0);

// ---- evaluation ------------------------------------------------------------------

const EASE: Record<Ease, (u: number) => number> = {
  linear: (u) => u,
  inout: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 2,
};

const curves = new WeakMap<Key[], CatmullRomCurve3 | Vector3>();
function along(keys: Key[], u: number, out: Vector3): Vector3 {
  let c = curves.get(keys);
  if (!c) {
    c = keys.length === 1 ? new Vector3(...keys[0]) : new CatmullRomCurve3(keys.map((k) => new Vector3(...k)), false, "centripetal");
    curves.set(keys, c);
  }
  return c instanceof Vector3 ? out.copy(c) : c.getPoint(u, out);
}

export type ShotSample = { shot: CamShot; index: number; u: number; fov: number; pos: Vector3; look: Vector3 };

/** The shot on screen at time t, its eased progress and its (frame-local) camera. */
export function sampleShot(seq: Sequence, t: number, out: ShotSample): ShotSample {
  const shots = SEQUENCES[seq].shots;
  let t0 = 0;
  let i = 0;
  while (i < shots.length - 1 && t >= t0 + shots[i].dur) t0 += shots[i++].dur;
  const sh = shots[i];
  const raw = Math.min(1, Math.max(0, (t - t0) / sh.dur));
  const u = EASE[sh.ease ?? "inout"](raw);
  out.shot = sh;
  out.index = i;
  out.u = u;
  out.fov = sh.fov[0] + (sh.fov[1] - sh.fov[0]) * u;
  along(sh.pos, u, out.pos);
  along(sh.look, u, out.look);
  return out;
}

/** Black dips and white flashes around shot boundaries, and the final fade. */
export function transitions(seq: Sequence, t: number): { black: number; white: number } {
  const def = SEQUENCES[seq];
  let black = 0;
  let white = 0;
  let b = 0;
  def.shots.forEach((sh, i) => {
    const d = Math.abs(t - b);
    if (sh.enter === "dip" || (i === 0 && sh.enter !== "flash")) {
      // the first shot fades up from black; later dips go down and up
      const w = i === 0 ? 0.9 : 0.32;
      const k = i === 0 ? (t < b + w ? 1 - (t - b) / w : 0) : Math.max(0, 1 - d / w);
      black = Math.max(black, k * k * (3 - 2 * k));
    } else if (sh.enter === "flash") white = Math.max(white, Math.max(0, 1 - d / 0.3));
    b += sh.dur;
  });
  const end = b;
  if (t > end - def.fadeOut) black = Math.max(black, Math.min(1, (t - (end - def.fadeOut)) / def.fadeOut));
  return { black, white };
}

/** Sum of decaying shake impulses at t (0 = still). */
export function shakeAt(seq: Sequence, t: number): number {
  let s = 0;
  for (const k of SEQUENCES[seq].shakes) if (t >= k.at) s += k.amp * Math.exp(-(t - k.at) * 2.6);
  return s;
}

/** Smooth 0→1 between a and b. */
export const ramp = (t: number, a: number, b: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A damped bump: 0 before `at`, rises fast and rings down. */
export const kick = (t: number, at: number, rate = 3, freq = 5): number => (t < at ? 0 : Math.exp(-(t - at) * rate) * Math.sin((t - at) * freq));
