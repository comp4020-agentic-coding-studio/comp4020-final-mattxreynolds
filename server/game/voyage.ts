// The voyage reducer: the only two ways a voyage changes are applyIntent and
// tick. Pure: no I/O, time is passed in. Rules: docs/PUZZLES.md and
// docs/SYSTEMS.md. State shape: ./state.ts. Continuous systems: ./ship.ts.

import { CASCADE, DANGER, ESCAPE, FINALE, FLOOD, MAX_TICK_DT_S, MODES, POWER, RADIO, type Mode } from "../../shared/config.ts";
import { COMPARTMENTS, SYSTEMS, type Compartment, type ShipSystem } from "../../shared/glyphs.ts";
import {
  ACT_OF,
  ACT_START,
  ACT_TITLE,
  CIRCUITS,
  INTENT_RULES,
  isPlaying,
  phaseIndex,
  type Act,
  type Circuit,
  type Fx,
  type Intent,
  type Phase,
  type RejectReason,
  type Role,
} from "../../shared/protocol.ts";
import { recordSample, buildDebrief } from "./debrief.ts";
import { prepareStart } from "./scenario.ts";
import { evacLive, gridReset as resetGrid, gridTrip, radioPowered, shipLive, tickShip, tickWater } from "./ship.ts";
import { addDanger, meanLevel, mistake, note, rules, type Voyage } from "./state.ts";

export { createVoyage, upgradeVoyage, type Seat, type Voyage } from "./state.ts";

export type Result = { ok: true; fx: Fx[] } | { ok: false; reason: RejectReason };

const FAILURE_CAUSE: Partial<Record<Phase, string>> = {
  PROLOGUE: "The ship went down before power was restored",
  POWER: "Emergency power never came online",
  FLOOD: "Flood control collapsed",
  RADIO: "No distress call reached shore",
  CASCADE: "The ship's systems failed one after another",
  ESCAPE: "The escape route flooded",
};

const ROMAN = ["", "I", "II", "III", "IV", "V"];

const NEXT: Partial<Record<Phase, Phase>> = {
  LOBBY: "PROLOGUE",
  PROLOGUE: "POWER",
  POWER: "FLOOD",
  FLOOD: "RADIO",
  RADIO: "CASCADE",
  CASCADE: "ESCAPE",
  ESCAPE: "SURVIVED",
};

// ------------------------------------------------------------- transitions

/** Moves `from` → next phase. Does nothing unless the voyage is still in
 * `from`, so a phase completes exactly once however many callers race. */
export function advance(v: Voyage, from: Phase, now: number, fx: Fx[]): boolean {
  if (v.phase !== from) return false;
  const to = NEXT[from];
  if (!to) return false;
  if (from === "LOBBY" && v.practice !== null && v.practice > 1) {
    // a practice run starts at a later act from a controlled scenario: the
    // earlier acts are set up as a crew who had solved them cleanly would
    // leave them (server/game/scenario.ts)
    return enterPractice(v, now, fx);
  }
  enter(v, to, now, fx);
  return true;
}

function enter(v: Voyage, to: Phase, now: number, fx: Fx[]): void {
  v.phase = to;
  v.phaseTimes[to] = v.elapsedMs;
  if (phaseIndex(to) > phaseIndex(v.deepestPhase)) v.deepestPhase = to;
  if (to === "PROLOGUE" || (v.startedAt === null && isPlaying(to))) {
    v.startedAt = now;
    v.lastTickAt = now;
  }
  if (to === "POWER" && v.danger < DANGER.start) v.danger = DANGER.start;
  if (to === "CASCADE") v.ship.cascadeAtMs = v.elapsedMs;
  const act = ACT_OF[to];
  if (act && to === ACT_START[act]) note(v, "SHIP", "act", `Act ${ROMAN[act]} — ${ACT_TITLE[act]}`);
  if (to === "SURVIVED") {
    note(v, "SHIP", "survived", "Both crew abandoned ship together — survived", "good");
    finish(v, now);
  }
  fx.push({ k: "phase", phase: to });
}

function enterPractice(v: Voyage, now: number, fx: Fx[]): boolean {
  const start = ACT_START[v.practice as Act];
  prepareStart(v, start);
  v.startedAt = now;
  v.lastTickAt = now;
  note(v, "SHIP", "practice", `Practice from Act ${v.practice} — earlier acts set up as solved`);
  enter(v, start, now, fx);
  return true;
}

function finish(v: Voyage, now: number): void {
  v.endedAt = now;
  recordSample(v, true);
  v.debrief = buildDebrief(v);
}

export function lose(v: Voyage, now: number, fx: Fx[]): boolean {
  if (!isPlaying(v.phase)) return false;
  v.failureCause = FAILURE_CAUSE[v.phase] ?? "The ship went down";
  note(v, "SHIP", "lost", `${v.failureCause}`, "bad");
  v.phase = "LOST";
  v.danger = DANGER.max;
  finish(v, now);
  fx.push({ k: "phase", phase: "LOST" });
  return true;
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
const validCircuit = (c: unknown): c is Circuit => CIRCUITS.includes(c as Circuit);
const isInt = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

export function bothSeatsReady(v: Voyage): boolean {
  return Boolean(v.seats.ENGINEER?.ready && v.seats.NAVIGATOR?.ready);
}

const unready = (v: Voyage): void => {
  for (const s of Object.values(v.seats)) if (s) s.ready = false;
};

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
    case "setMode": {
      const mode = intent.mode as Mode;
      if (!MODES.includes(mode)) return reject("bad-input");
      if (!v.unlocks.modes.includes(mode)) return reject("locked");
      if (v.mode !== mode) {
        v.mode = mode;
        v.ship.circuits.LIGHTS = !rules(v).dark;
        unready(v); // both must agree to the new terms
      }
      break;
    }
    case "setStart": {
      const act = intent.act;
      if (!isInt(act, 1, 5)) return reject("bad-input");
      if (act > v.unlocks.acts) return reject("locked");
      const practice = act === 1 ? null : (act as Act);
      if (v.practice !== practice) {
        v.practice = practice;
        unready(v);
      }
      break;
    }
    case "prologueBreaker": {
      if (!v.prologue.busOn) {
        v.prologue.busOn = true;
        fx.push({ k: "busOn" });
        note(v, role, "busOn", "Emergency bus restored");
      }
      break;
    }
    case "prologueAck": {
      if (!v.prologue.busOn) return reject("consoles-dead");
      if (!v.prologue.acknowledged) {
        v.prologue.acknowledged = true;
        fx.push({ k: "ack" });
        note(v, role, "ack", "Alarm acknowledged — Bridge and Engine Room linked");
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
      else if (closed && v.power.closed.filter(Boolean).length >= SYSTEMS.length && !allFed(v)) {
        // three breakers that don't feed one each of pumps/radio/helm backfeed
        // the bus: guessing combinations costs a trip, so the Bridge's routing
        // diagram is needed, not just the load meter (docs/PUZZLES.md)
        trip(v, now, "backfeed", fx);
      }
      break;
    }
    case "setValve": {
      if (!validCompartment(intent.compartment) || typeof intent.open !== "boolean") return reject("bad-input");
      if (v.flood.valves[intent.compartment] !== intent.open) {
        v.flood.valves[intent.compartment] = intent.open;
      }
      break;
    }
    case "setPump": {
      if (!isInt(intent.pump, 0, 2) || typeof intent.on !== "boolean") return reject("bad-input");
      const running = v.flood.pumps.filter(Boolean).length;
      if (intent.on && !v.flood.pumps[intent.pump] && running >= FLOOD.maxPumps) return reject("pump-bus-limit");
      if (intent.on && !v.flood.pumps[intent.pump] && now < v.flood.seizedUntil[intent.pump]) return reject("pump-seized");
      v.flood.pumps[intent.pump] = intent.on;
      break;
    }
    case "setCircuit": {
      if (!validCircuit(intent.circuit) || typeof intent.on !== "boolean") return reject("bad-input");
      if (v.ship.circuits[intent.circuit] !== intent.on) {
        v.ship.circuits[intent.circuit] = intent.on;
        note(v, role, "circuit", `${intent.circuit} circuit ${intent.on ? "energised" : "shed"}`);
      }
      break;
    }
    case "gridReset": {
      const why = resetGrid(v, now, fx);
      if (why) return reject(why);
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
      if (!radioPowered(v)) return reject("radio-unpowered");
      if (v.radio.channel === v.config.radio.resonance) {
        v.radio.coupled = true;
        fx.push({ k: "coupled" });
        note(v, role, "coupled", "Transmitter coupled at resonance");
      } else {
        mistake(v, RADIO.dangerArc);
        fx.push({ k: "arc" });
        note(v, role, "arc", "Transmitter arced — coupled off resonance", "bad");
      }
      break;
    }
    case "setAntenna": {
      if (!isInt(intent.bearing, 0, 7)) return reject("bad-input");
      if (v.phase === "RADIO" && v.radio.contact) break;
      v.radio.antenna = intent.bearing;
      break;
    }
    case "transmit": {
      if (!v.radio.coupled) return reject("not-coupled");
      if (!radioPowered(v)) return reject("radio-unpowered");
      if (v.radio.contact) break;
      const at = stationAt(v, v.radio.antenna);
      if (at === v.config.radio.target) {
        v.radio.contact = true;
        v.radio.lastReply = "contact";
        note(v, role, "contact", "Distress signal received ashore", "good");
      } else if (at >= 0) {
        v.radio.lastReply = "wrong-station";
        mistake(v, RADIO.dangerWrongStation);
        note(v, role, "wrongStation", "Wrong station raised — cannot assist", "bad");
      } else {
        v.radio.lastReply = "no-carrier";
        mistake(v, RADIO.dangerNoCarrier);
      }
      fx.push({ k: "reply", result: v.radio.lastReply });
      break;
    }
    case "answerCall": {
      const s = v.ship;
      if (s.call === null) return reject("no-call");
      if (!radioPowered(v)) return reject("radio-unpowered");
      const call = v.config.cascade.calls[s.call];
      s.call = null;
      if (v.radio.antenna === call.bearing) {
        s.callsAnswered++;
        fx.push({ k: "callResult", answered: true });
        note(v, role, "callAnswered", "Answered the coast station — rescue vectored", "good");
      } else {
        s.callsMissed++;
        mistake(v, RADIO.dangerWrongStation);
        fx.push({ k: "callResult", answered: false });
        note(v, role, "callMissed", "Answered with the antenna off the station — call lost", "bad");
      }
      break;
    }
    case "armDavits": {
      const s = v.ship;
      if (s.armed) break;
      if (!evacLive(v)) return reject("evac-offline");
      if (s.evac < FINALE.armCharge) return reject("evac-low");
      s.armed = true;
      fx.push({ k: "davitsArmed", armed: true });
      note(v, role, "davits", "Lifeboat davits armed", "good");
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
        note(v, role, "vent", "Door rams over-pressured — relief vented", "bad");
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
      if (!v.ship.armed) return reject("davits-not-armed");
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

function allFed(v: Voyage): boolean {
  return SYSTEMS.every((sys) => v.config.power.feeders[sys].some((i) => v.power.closed[i]));
}

function trip(v: Voyage, now: number, cause: "short" | "overload" | "backfeed", fx: Fx[]): void {
  v.power.closed = v.power.closed.map(() => false);
  v.power.trippedUntil = now + POWER.tripMs;
  v.ship.powerTrips++;
  mistake(v, cause === "short" ? POWER.dangerShort : POWER.dangerOverload);
  fx.push({ k: "trip", cause });
  note(v, "ENGINEER", "trip", `Breakers tripped (${cause}) — the generator is worn for the rest of the voyage`, "bad");
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
        note(v, "ENGINEER", "powerOnline", "Emergency power online — pumps, radio and helm fed", "good");
        advance(v, "POWER", now, fx);
      }
      break;
    }
    case "FLOOD":
      if (v.flood.held >= FLOOD.holdS) {
        v.flood.stable = true;
        addDanger(v, -FLOOD.dangerRelief);
        fx.push({ k: "floodStable" });
        note(v, "SHIP", "floodStable", "Every compartment below 20% — damage control shores the hull", "good");
        advance(v, "FLOOD", now, fx);
      }
      break;
    case "RADIO":
      if (v.radio.contact) {
        addDanger(v, -RADIO.dangerRelief);
        advance(v, "RADIO", now, fx);
      }
      break;
    case "CASCADE":
      if (v.ship.evac >= 100) {
        addDanger(v, -CASCADE.dangerRelief);
        advance(v, "CASCADE", now, fx);
      }
      break;
    case "ESCAPE": {
      const e = v.escape.abandonAt.ENGINEER;
      const n = v.escape.abandonAt.NAVIGATOR;
      if (e !== undefined && n !== undefined && Math.abs(e - n) <= ESCAPE.abandonWindowMs && v.ship.armed) {
        v.ship.margin = (DANGER.max - v.danger) / Math.max(0.01, v.dangerRate);
        advance(v, "ESCAPE", now, fx);
      }
      break;
    }
  }
  if (v.danger >= DANGER.max) lose(v, now, fx);
}

// ------------------------------------------------------------- tick

/** Danger %/s from the water itself, in every act with live compartments. */
function waterDanger(v: Voyage): number {
  return DANGER.rate.PER_LEVEL * (meanLevel(v) / 100);
}

export function dangerRateOf(v: Voyage): number {
  const r = DANGER.rate;
  let base = 0;
  switch (v.phase) {
    case "POWER":
      base = r.POWER;
      break;
    case "FLOOD":
      base = r.FLOOD;
      break;
    case "RADIO":
      base = r.RADIO;
      break;
    case "CASCADE":
      base = r.CASCADE;
      break;
    case "ESCAPE":
      // each coast station answered in Act IV vectored rescue closer
      base = r.ESCAPE * Math.max(0.5, 1 - FINALE.callBonus * v.ship.callsAnswered);
      break;
  }
  const water = shipLive(v) ? waterDanger(v) : 0;
  return (base + water) * rules(v).danger;
}

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

  tickShip(v, now, dt, fx);
  if (v.phase === "FLOOD") {
    const below = COMPARTMENTS.every((c) => v.flood.levels[c] <= FLOOD.targetLevel);
    v.flood.held = below ? v.flood.held + dt : 0;
  }
  if (v.phase === "ESCAPE") tickEscape(v, now, dt, fx);
  v.dangerRate = dangerRateOf(v);
  addDanger(v, v.dangerRate * dt);
  recordSample(v);
  checkProgress(v, now, fx);
  return fx;
}

function tickEscape(v: Voyage, now: number, dt: number, fx: Fx[]): void {
  const e = v.escape;
  const decay = rules(v).doorDecay;
  const moving = e.door < 100 && e.held && escapeInBand(v);
  if (moving) {
    e.door = Math.min(100, e.door + ESCAPE.doorRate * dt);
    if (e.door >= 100) {
      fx.push({ k: "doorOpen" });
      note(v, "SHIP", "doorOpen", "Watertight escape door fully open", "good");
    }
  } else if (e.door < 100 && e.held && e.pressure > v.config.escape.band[1]) {
    // over-pressure with the release held: the rams slip and the door sags
    // back, so the Engineer must be told when to stop, not just pump blindly
    e.door = Math.max(0, e.door - ESCAPE.slipRate * dt);
  }
  e.pressure = Math.max(0, e.pressure - (moving ? ESCAPE.decayDoor : ESCAPE.decayIdle) * decay * dt);
  for (const r of ["ENGINEER", "NAVIGATOR"] as const) {
    const at = e.abandonAt[r];
    if (at !== undefined && now - at > ESCAPE.abandonWindowMs) delete e.abandonAt[r];
  }
}

// re-exported for tests that drive the water model directly
export { tickWater, gridTrip };
