// The canonical voyage: its shape, its creation and the few helpers every
// rule module shares. Pure: no I/O, time is passed in.

import { DANGER, MAX_LOG, MODE_RULES, type Mode, type ModeRules } from "../../shared/config.ts";
import { COMPARTMENTS, type Compartment } from "../../shared/glyphs.ts";
import type { Act, Circuit, DebriefEvent, DebriefSample, Debrief, Phase, Role } from "../../shared/protocol.ts";
import { generatePuzzles, type PuzzleConfig } from "./puzzles.ts";

export type Seat = { callsign: string; ready: boolean };

export type ShipState = {
  grid: {
    heat: number;
    /** generator tripped: no power anywhere until the Engineer resets it */
    down: boolean;
    trippedUntil: number;
    trips: number;
  };
  /** Act I breaker trips: each one derates the generator for the whole voyage */
  powerTrips: number;
  circuits: Record<Circuit, boolean>;
  /** evac accumulator charge 0–100 */
  evac: number;
  armed: boolean;
  /** extra inflow %/s from Act IV breaches */
  breach: Record<Compartment, number>;
  /** extra inflow %/s from Act II relief-valve bursts (cracked seams) */
  seams: Record<Compartment, number>;
  lost: Record<Compartment, boolean>;
  /** simulated ms when CASCADE began; schedules breaches and calls */
  cascadeAtMs: number | null;
  breachesDone: number;
  callsDone: number;
  /** the coast station currently calling: index into config.cascade.calls */
  call: number | null;
  callsAnswered: number;
  callsMissed: number;
  /** debrief only: the worst it got, and seconds of water left at the escape */
  peakDanger: number;
  margin: number | null;
  peakLevel: { c: Compartment; level: number; t: number } | null;
};

export type Voyage = {
  id: string;
  code: string;
  seed: number;
  /** links the voyages of one pair (create → sail again → …): unlocks follow it */
  crewId: string;
  mode: Mode;
  /** null = a full voyage; otherwise a practice run that began at this act */
  practice: Act | null;
  phase: Phase;
  deepestPhase: Phase;
  seats: Partial<Record<Role, Seat>>;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Simulated play time; frozen while paused, so it is fair across outages. */
  elapsedMs: number;
  lastTickAt: number | null;
  paused: boolean;
  danger: number;
  dangerRate: number;
  mistakes: number;
  failureCause: string | null;
  nextCode: string | null;
  phaseTimes: Partial<Record<Phase, number>>;
  config: PuzzleConfig;
  prologue: { busOn: boolean; acknowledged: boolean };
  power: { closed: boolean[]; trippedUntil: number; online: boolean };
  flood: {
    levels: Record<Compartment, number>;
    prevLevels: Record<Compartment, number>;
    valves: Record<Compartment, boolean>;
    pressure: Record<Compartment, number>;
    pumps: boolean[];
    stable: boolean;
    /** seconds each compartment's pump has been running dry */
    dry: Record<Compartment, number>;
    /** per pump: restart refused until this time (seized running dry) */
    seizedUntil: number[];
    /** seconds every compartment has been at or below the line */
    held: number;
  };
  radio: {
    channel: number;
    coupled: boolean;
    antenna: number;
    contact: boolean;
    lastReply: "contact" | "wrong-station" | "no-carrier" | null;
  };
  escape: {
    pressure: number;
    held: boolean;
    door: number;
    lastStrokeAt: number;
    abandonAt: Partial<Record<Role, number>>;
  };
  ship: ShipState;
  /** What this crew has unlocked (set by the manager from the Ship's Log). */
  unlocks: { modes: Mode[]; acts: Act };
  /** Monotonic: bumped by every recorded event. */
  seq: number;
  /** Significant events in order (debrief, diagnostics). */
  log: DebriefEvent[];
  samples: DebriefSample[];
  debrief: Debrief | null;
};

export function rules(v: Voyage): ModeRules {
  return MODE_RULES[v.mode] ?? MODE_RULES.STANDARD;
}

const perCompartment = <T>(f: () => T): Record<Compartment, T> =>
  Object.fromEntries(COMPARTMENTS.map((c) => [c, f()])) as Record<Compartment, T>;

export function createVoyage(
  id: string,
  code: string,
  seed: number,
  now: number,
  opts: { mode?: Mode; crewId?: string; practice?: Act | null } = {},
): Voyage {
  const config = generatePuzzles(seed);
  const mode = opts.mode ?? "STANDARD";
  return {
    id,
    code,
    seed,
    crewId: opts.crewId ?? id,
    mode,
    practice: opts.practice ?? null,
    phase: "LOBBY",
    deepestPhase: "LOBBY",
    seats: {},
    createdAt: now,
    startedAt: null,
    endedAt: null,
    elapsedMs: 0,
    lastTickAt: null,
    paused: false,
    danger: 0,
    dangerRate: 0,
    mistakes: 0,
    failureCause: null,
    nextCode: null,
    phaseTimes: {},
    config,
    prologue: { busOn: false, acknowledged: false },
    power: { closed: config.power.breakers.map(() => false), trippedUntil: 0, online: false },
    flood: {
      levels: { ...config.flood.start },
      prevLevels: { ...config.flood.start },
      valves: perCompartment(() => false),
      pressure: perCompartment(() => 0),
      pumps: [false, false, false],
      stable: false,
      dry: perCompartment(() => 0),
      seizedUntil: [0, 0, 0],
      held: 0,
    },
    radio: { channel: 0, coupled: false, antenna: 0, contact: false, lastReply: null },
    escape: { pressure: 0, held: false, door: 0, lastStrokeAt: 0, abandonAt: {} },
    ship: {
      grid: { heat: 0, down: false, trippedUntil: 0, trips: 0 },
      powerTrips: 0,
      circuits: { LIGHTS: !MODE_RULES[mode].dark, RADIO: true, EVAC: false },
      evac: 0,
      armed: false,
      breach: perCompartment(() => 0),
      seams: perCompartment(() => 0),
      lost: perCompartment(() => false),
      cascadeAtMs: null,
      breachesDone: 0,
      callsDone: 0,
      call: null,
      callsAnswered: 0,
      callsMissed: 0,
      peakDanger: 0,
      margin: null,
      peakLevel: null,
    },
    unlocks: { modes: ["STANDARD"], acts: 1 },
    seq: 0,
    log: [],
    samples: [],
    debrief: null,
  };
}

/** Old saves (before the ship systems existed) gain the new fields. */
export function upgradeVoyage(v: Voyage): Voyage {
  const fresh = createVoyage(v.id, v.code, v.seed, v.createdAt, { mode: v.mode });
  v.mode ??= "STANDARD";
  v.crewId ??= v.id;
  v.practice ??= null;
  v.ship ??= fresh.ship;
  v.flood.dry ??= fresh.flood.dry;
  v.flood.seizedUntil ??= fresh.flood.seizedUntil;
  v.flood.held ??= 0;
  v.unlocks ??= fresh.unlocks;
  v.seq ??= 0;
  v.log ??= [];
  v.samples ??= [];
  v.debrief ??= null;
  if (!v.config.cascade) v.config = { ...fresh.config, ...v.config, cascade: fresh.config.cascade };
  return v;
}

// ------------------------------------------------------------- helpers

export function addDanger(v: Voyage, amount: number): void {
  v.danger = Math.max(0, Math.min(DANGER.max, v.danger + amount));
  if (v.danger > v.ship.peakDanger) v.ship.peakDanger = v.danger;
}

export function mistake(v: Voyage, danger: number): void {
  v.mistakes++;
  addDanger(v, danger);
}

/** Records a significant event (debrief timeline, diagnostics). */
export function note(v: Voyage, actor: DebriefEvent["actor"], k: string, text: string, tone: DebriefEvent["tone"] = "info"): void {
  v.seq++;
  v.log.push({ seq: v.seq, t: Math.round(v.elapsedMs), actor, k, text, tone });
  if (v.log.length > MAX_LOG) v.log.splice(1, v.log.length - MAX_LOG);
}

export const meanLevel = (v: Voyage): number =>
  COMPARTMENTS.reduce((n, c) => n + v.flood.levels[c], 0) / COMPARTMENTS.length;
