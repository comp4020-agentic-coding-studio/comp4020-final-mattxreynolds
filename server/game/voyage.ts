// The canonical voyage and the only two ways it changes: applyIntent and tick.
// Pure: no I/O, time is passed in. Rules: docs/PUZZLES.md.

import { DANGER, ESCAPE, FLOOD, MAX_TICK_DT_S, POWER, RADIO } from "../../shared/config.ts";
import { COMPARTMENTS, SYSTEMS, type Compartment, type ShipSystem } from "../../shared/glyphs.ts";
import {
  INTENT_RULES,
  isPlaying,
  type Fx,
  type Intent,
  type Phase,
  type RejectReason,
  type Role,
} from "../../shared/protocol.ts";
import { generatePuzzles, type PuzzleConfig } from "./puzzles.ts";

export type Seat = { callsign: string; ready: boolean };

export type Voyage = {
  id: string;
  code: string;
  seed: number;
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
};

export type Result = { ok: true; fx: Fx[] } | { ok: false; reason: RejectReason };

const FAILURE_CAUSE: Partial<Record<Phase, string>> = {
  PROLOGUE: "The ship went down before power was restored",
  POWER: "Emergency power never came online",
  FLOOD: "Flood control collapsed",
  RADIO: "No distress call reached shore",
  ESCAPE: "The escape route flooded",
};

const PHASE_ORDER: Phase[] = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "ESCAPE", "SURVIVED"];
const NEXT: Partial<Record<Phase, Phase>> = {
  LOBBY: "PROLOGUE",
  PROLOGUE: "POWER",
  POWER: "FLOOD",
  FLOOD: "RADIO",
  RADIO: "ESCAPE",
  ESCAPE: "SURVIVED",
};

export function createVoyage(id: string, code: string, seed: number, now: number): Voyage {
  const config = generatePuzzles(seed);
  return {
    id,
    code,
    seed,
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
      valves: { FORE: false, CARGO: false, ENGINE: false },
      pressure: { FORE: 0, CARGO: 0, ENGINE: 0 },
      pumps: [false, false, false],
      stable: false,
    },
    radio: { channel: 0, coupled: false, antenna: 0, contact: false, lastReply: null },
    escape: { pressure: 0, held: false, door: 0, lastStrokeAt: 0, abandonAt: {} },
  };
}

// ------------------------------------------------------------- transitions

/** Moves `from` → next phase. Does nothing unless the voyage is still in
 * `from`, so a phase completes exactly once however many callers race. */
export function advance(v: Voyage, from: Phase, now: number, fx: Fx[]): boolean {
  if (v.phase !== from) return false;
  const to = NEXT[from];
  if (!to) return false;
  v.phase = to;
  v.phaseTimes[to] = v.elapsedMs;
  if (PHASE_ORDER.indexOf(to) > PHASE_ORDER.indexOf(v.deepestPhase)) v.deepestPhase = to;
  if (to === "PROLOGUE") {
    v.startedAt = now;
    v.lastTickAt = now;
  }
  if (to === "POWER") v.danger = DANGER.start;
  if (to === "SURVIVED") v.endedAt = now;
  fx.push({ k: "phase", phase: to });
  return true;
}

export function lose(v: Voyage, now: number, fx: Fx[]): boolean {
  if (!isPlaying(v.phase)) return false;
  v.failureCause = FAILURE_CAUSE[v.phase] ?? "The ship went down";
  v.phase = "LOST";
  v.endedAt = now;
  v.danger = DANGER.max;
  fx.push({ k: "phase", phase: "LOST" });
  return true;
}

function addDanger(v: Voyage, amount: number): void {
  v.danger = Math.max(0, Math.min(DANGER.max, v.danger + amount));
}

function mistake(v: Voyage, danger: number): void {
  v.mistakes++;
  addDanger(v, danger);
}

// ------------------------------------------------------------- derived

export function powerLoad(v: Voyage): number {
  return v.power.closed.reduce((n, c, i) => n + (c ? v.config.power.breakers[i].load : 0), 0);
}

export function powerTripped(v: Voyage, now: number): boolean {
  return now < v.power.trippedUntil;
}

export function systemsFed(v: Voyage, now: number): Record<ShipSystem, boolean> {
  const tripped = powerTripped(v, now);
  const out = {} as Record<ShipSystem, boolean>;
  for (const s of SYSTEMS) {
    out[s] = !tripped && v.config.power.feeders[s].some((i) => v.power.closed[i]);
  }
  return out;
}

export function pumpFor(v: Voyage, c: Compartment): number {
  return v.config.flood.pumpTo.indexOf(c);
}

/** 0..1: how close the tuned channel is to resonance. */
export function resonance(v: Voyage): number {
  const d = Math.abs(v.radio.channel - v.config.radio.resonance);
  return Math.max(0, 1 - d / 8);
}

export function stationAt(v: Voyage, bearing: number): number {
  return v.config.radio.stations.findIndex((s) => s.bearing === bearing);
}

export function escapeInBand(v: Voyage): boolean {
  const [lo, hi] = v.config.escape.band;
  return v.escape.pressure >= lo && v.escape.pressure <= hi;
}

// ------------------------------------------------------------- intents

const validCompartment = (c: unknown): c is Compartment => COMPARTMENTS.includes(c as Compartment);
const isInt = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

export function bothSeatsReady(v: Voyage): boolean {
  return Boolean(v.seats.ENGINEER?.ready && v.seats.NAVIGATOR?.ready);
}

/** Validates and applies one intent. Never trusts the client about outcomes. */
export function applyIntent(v: Voyage, role: Role, intent: Intent, now: number): Result {
  // own keys only: {t: "toString"} must not find Object.prototype.toString
  const t = intent?.t;
  if (typeof t !== "string" || !Object.hasOwn(INTENT_RULES, t)) return { ok: false, reason: "bad-input" };
  const rule = INTENT_RULES[t];
  if (!v.seats[role]) return { ok: false, reason: "not-seated" };
  if (!rule.phases.includes(v.phase)) return { ok: false, reason: "wrong-phase" };
  if (!rule.roles.includes(role)) return { ok: false, reason: "wrong-role" };
  if (v.paused && isPlaying(v.phase)) return { ok: false, reason: "paused" };

  const fx: Fx[] = [];
  const reject = (reason: RejectReason): Result => ({ ok: false, reason });

  switch (intent.t) {
    case "setReady": {
      if (typeof intent.ready !== "boolean") return reject("bad-input");
      v.seats[role]!.ready = intent.ready;
      break; // start is decided by the manager, which knows who is connected
    }
    case "prologueBreaker": {
      if (!v.prologue.busOn) {
        v.prologue.busOn = true;
        fx.push({ k: "busOn" });
      }
      break;
    }
    case "prologueAck": {
      if (!v.prologue.busOn) return reject("consoles-dead");
      if (!v.prologue.acknowledged) {
        v.prologue.acknowledged = true;
        fx.push({ k: "ack" });
      }
      break;
    }
    case "setBreaker": {
      const { index, closed } = intent;
      if (!isInt(index, 0, POWER.breakers - 1) || typeof closed !== "boolean") return reject("bad-input");
      if (v.power.online) break; // locked once solved
      if (closed && powerTripped(v, now)) return reject("generator-tripped");
      if (v.power.closed[index] === closed) break;
      v.power.closed[index] = closed;
      if (closed && index === v.config.power.shorted) trip(v, now, "short", fx);
      else if (powerLoad(v) > v.config.power.capacity) trip(v, now, "overload", fx);
      break;
    }
    case "setValve": {
      if (!validCompartment(intent.compartment) || typeof intent.open !== "boolean") return reject("bad-input");
      if (v.flood.stable) break;
      v.flood.valves[intent.compartment] = intent.open;
      break;
    }
    case "setPump": {
      if (!isInt(intent.pump, 0, 2) || typeof intent.on !== "boolean") return reject("bad-input");
      if (v.flood.stable) break;
      const running = v.flood.pumps.filter(Boolean).length;
      if (intent.on && !v.flood.pumps[intent.pump] && running >= FLOOD.maxPumps) return reject("pump-bus-limit");
      v.flood.pumps[intent.pump] = intent.on;
      break;
    }
    case "tune": {
      if (!isInt(intent.channel, 0, RADIO.channels - 1)) return reject("bad-input");
      if (v.radio.coupled) return reject("carrier-locked");
      v.radio.channel = intent.channel;
      break;
    }
    case "couple": {
      if (v.radio.coupled) break;
      if (v.radio.channel === v.config.radio.resonance) {
        v.radio.coupled = true;
        fx.push({ k: "coupled" });
      } else {
        mistake(v, RADIO.dangerArc);
        fx.push({ k: "arc" });
      }
      break;
    }
    case "setAntenna": {
      if (!isInt(intent.bearing, 0, 7)) return reject("bad-input");
      if (v.radio.contact) break;
      v.radio.antenna = intent.bearing;
      break;
    }
    case "transmit": {
      if (!v.radio.coupled) return reject("not-coupled");
      if (v.radio.contact) break;
      const at = stationAt(v, v.radio.antenna);
      if (at === v.config.radio.target) {
        v.radio.contact = true;
        v.radio.lastReply = "contact";
      } else if (at >= 0) {
        v.radio.lastReply = "wrong-station";
        mistake(v, RADIO.dangerWrongStation);
      } else {
        v.radio.lastReply = "no-carrier";
        mistake(v, RADIO.dangerNoCarrier);
      }
      fx.push({ k: "reply", result: v.radio.lastReply });
      break;
    }
    case "pumpStroke": {
      if (now - v.escape.lastStrokeAt < ESCAPE.strokeMinGapMs) return reject("too-fast");
      v.escape.lastStrokeAt = now;
      v.escape.pressure += ESCAPE.stroke;
      if (v.escape.pressure > ESCAPE.ventAt) {
        v.escape.pressure = ESCAPE.ventTo;
        v.mistakes++;
        fx.push({ k: "vent" });
      }
      break;
    }
    case "holdDoor": {
      if (typeof intent.held !== "boolean") return reject("bad-input");
      v.escape.held = intent.held;
      break;
    }
    case "abandon": {
      if (v.escape.door < 100) return reject("door-not-open");
      v.escape.abandonAt[role] = now;
      fx.push({ k: "abandonPulled", role });
      break;
    }
    case "sailAgain":
      break; // handled by the manager (creates a new voyage)
  }

  checkProgress(v, now, fx);
  return { ok: true, fx };
}

function trip(v: Voyage, now: number, cause: "short" | "overload", fx: Fx[]): void {
  v.power.closed = v.power.closed.map(() => false);
  v.power.trippedUntil = now + POWER.tripMs;
  mistake(v, cause === "short" ? POWER.dangerShort : POWER.dangerOverload);
  fx.push({ k: "trip", cause });
}

// ------------------------------------------------------------- progress

export function checkProgress(v: Voyage, now: number, fx: Fx[]): void {
  switch (v.phase) {
    case "PROLOGUE":
      if (v.prologue.busOn && v.prologue.acknowledged) advance(v, "PROLOGUE", now, fx);
      break;
    case "POWER": {
      const fed = systemsFed(v, now);
      if (SYSTEMS.every((s) => fed[s]) && powerLoad(v) <= v.config.power.capacity) {
        v.power.online = true;
        addDanger(v, -POWER.dangerRelief);
        fx.push({ k: "powerOnline" });
        advance(v, "POWER", now, fx);
      }
      break;
    }
    case "FLOOD":
      if (COMPARTMENTS.every((c) => v.flood.levels[c] <= FLOOD.targetLevel)) {
        v.flood.stable = true;
        addDanger(v, -FLOOD.dangerRelief);
        fx.push({ k: "floodStable" });
        advance(v, "FLOOD", now, fx);
      }
      break;
    case "RADIO":
      if (v.radio.contact) {
        addDanger(v, -RADIO.dangerRelief);
        advance(v, "RADIO", now, fx);
      }
      break;
    case "ESCAPE": {
      const e = v.escape.abandonAt.ENGINEER;
      const n = v.escape.abandonAt.NAVIGATOR;
      if (e !== undefined && n !== undefined && Math.abs(e - n) <= ESCAPE.abandonWindowMs) {
        advance(v, "ESCAPE", now, fx);
      }
      break;
    }
  }
  if (v.danger >= DANGER.max) lose(v, now, fx);
}

// ------------------------------------------------------------- tick

/** Advances the continuous simulation to `now`. */
export function tick(v: Voyage, now: number): Fx[] {
  const fx: Fx[] = [];
  if (!isPlaying(v.phase)) return fx;
  const last = v.lastTickAt ?? now;
  v.lastTickAt = now;
  if (v.paused) return fx;
  const dt = Math.min(MAX_TICK_DT_S, Math.max(0, (now - last) / 1000));
  if (dt === 0) return fx;
  v.elapsedMs += dt * 1000;

  let rate = 0;
  switch (v.phase) {
    case "POWER":
      rate = DANGER.rate.POWER;
      break;
    case "FLOOD": {
      tickFlood(v, dt, fx);
      const mean = COMPARTMENTS.reduce((n, c) => n + v.flood.levels[c], 0) / COMPARTMENTS.length;
      rate = DANGER.rate.FLOOD_BASE + DANGER.rate.FLOOD_PER_LEVEL * (mean / 100);
      break;
    }
    case "RADIO":
      rate = DANGER.rate.RADIO;
      break;
    case "ESCAPE":
      tickEscape(v, now, dt, fx);
      rate = DANGER.rate.ESCAPE;
      break;
  }
  v.dangerRate = rate;
  addDanger(v, rate * dt);
  checkProgress(v, now, fx);
  return fx;
}

function tickFlood(v: Voyage, dt: number, fx: Fx[]): void {
  const f = v.flood;
  f.prevLevels = { ...f.levels };
  for (const c of COMPARTMENTS) {
    const p = pumpFor(v, c);
    const pumpOn = f.pumps[p];
    const open = f.valves[c];
    let level = f.levels[c] + v.config.flood.inflow[c] * dt;
    if (pumpOn && open) {
      level -= FLOOD.drainRate * dt;
      f.pressure[c] = relax(f.pressure[c], dt);
    } else if (pumpOn && !open) {
      f.pressure[c] += FLOOD.pressureRise * dt;
      if (f.pressure[c] >= FLOOD.burstAt) {
        f.pressure[c] = 0;
        f.pumps[p] = false;
        mistake(v, FLOOD.dangerBurst);
        fx.push({ k: "burst", compartment: c });
      }
    } else if (!pumpOn && open) {
      level += FLOOD.backflowRate * dt;
      // backflow reads as negative line pressure on the Engineer's gauge
      f.pressure[c] = -25;
    } else {
      f.pressure[c] = relax(f.pressure[c], dt);
    }
    f.levels[c] = Math.max(0, Math.min(100, level));
  }
}

function relax(p: number, dt: number): number {
  const step = FLOOD.pressureRelax * dt;
  return Math.abs(p) <= step ? 0 : p - Math.sign(p) * step;
}

function tickEscape(v: Voyage, now: number, dt: number, fx: Fx[]): void {
  const e = v.escape;
  const moving = e.door < 100 && e.held && escapeInBand(v);
  if (moving) {
    e.door = Math.min(100, e.door + ESCAPE.doorRate * dt);
    if (e.door >= 100) fx.push({ k: "doorOpen" });
  }
  e.pressure = Math.max(0, e.pressure - (moving ? ESCAPE.decayDoor : ESCAPE.decayIdle) * dt);
  for (const r of ["ENGINEER", "NAVIGATOR"] as const) {
    const at = e.abandonAt[r];
    if (at !== undefined && now - at > ESCAPE.abandonWindowMs) delete e.abandonAt[r];
  }
}
