// The ship's continuous systems (docs/SYSTEMS.md): the electrical grid, the
// water in each compartment, hull damage, the Act IV breaches and coast
// station calls, and the evac accumulator. They run from Act II until the
// voyage ends. Pure: time is passed in, effects are returned as Fx.

import { CASCADE, FINALE, FLOOD, GRID, HULL } from "../../shared/config.ts";
import { COMPARTMENTS, COMPARTMENT_LABEL, type Compartment } from "../../shared/glyphs.ts";
import { SHIP_PHASES, type Circuit, type Fx } from "../../shared/protocol.ts";
import { addDanger, mistake, note, rules, type Voyage } from "./state.ts";

export const shipLive = (v: Voyage): boolean => SHIP_PHASES.includes(v.phase);

// ------------------------------------------------------------- grid

/** What the generator can deliver now: worn by every trip this voyage. */
export function gridOutput(v: Voyage): number {
  const wear = Math.min(v.ship.powerTrips * GRID.wearPerPowerTrip, GRID.maxPowerWear) + v.ship.grid.trips * GRID.wearPerGridTrip;
  return Math.max(GRID.minCapacity, GRID.baseCapacity + rules(v).capacity - wear);
}

export function gridWear(v: Voyage): number {
  return GRID.baseCapacity + rules(v).capacity - gridOutput(v);
}

/** Per-circuit draw (the Bridge's distribution panel). */
export function gridDraw(v: Voyage): Record<Circuit | "PUMPS" | "DAVITS", number> {
  const s = v.ship;
  const radioActive = v.phase === "RADIO" || s.call !== null;
  return {
    PUMPS: v.flood.pumps.filter(Boolean).length * GRID.load.pump,
    LIGHTS: s.circuits.LIGHTS ? GRID.load.lights : 0,
    RADIO: s.circuits.RADIO ? (radioActive ? GRID.load.radioActive : GRID.load.radioIdle) : 0,
    EVAC: s.circuits.EVAC && evacAvailable(v) ? (s.evac < 100 ? GRID.load.evacCharging : GRID.load.evacHolding) : 0,
    DAVITS: s.armed ? GRID.load.davits : 0,
  };
}

export function gridLoad(v: Voyage): number {
  if (!shipLive(v)) return 0;
  const d = gridDraw(v);
  return d.PUMPS + d.LIGHTS + d.RADIO + d.EVAC + d.DAVITS;
}

export const gridUp = (v: Voyage): boolean => !v.ship.grid.down;
/** The accumulator exists from Act IV. */
export const evacAvailable = (v: Voyage): boolean => v.phase === "CASCADE" || v.phase === "ESCAPE";
export const evacLive = (v: Voyage): boolean => evacAvailable(v) && gridUp(v) && v.ship.circuits.EVAC;
export const radioPowered = (v: Voyage): boolean => !shipLive(v) || (gridUp(v) && v.ship.circuits.RADIO);

export function gridTrip(v: Voyage, now: number, fx: Fx[], why: string): void {
  const s = v.ship;
  s.grid.down = true;
  s.grid.trippedUntil = now + GRID.tripMs;
  s.grid.trips++;
  s.grid.heat = GRID.heatAfterTrip;
  mistake(v, GRID.dangerTrip);
  fx.push({ k: "gridTrip" });
  note(v, "SHIP", "gridTrip", `Generator tripped (${why}); output now ${gridOutput(v)}`, "bad");
  if (s.armed) {
    s.armed = false;
    fx.push({ k: "davitsArmed", armed: false });
    note(v, "SHIP", "davits", "Davits lost hold when the power died", "bad");
  }
  if (evacAvailable(v) && s.evac > 0) s.evac = Math.max(0, s.evac - CASCADE.chargeLostOnTrip);
  if (rules(v).chain) {
    // the surge blows a running pump's relief valve too
    const p = v.flood.pumps.findIndex(Boolean);
    if (p >= 0) burst(v, v.config.flood.pumpTo[p], fx, "power surge");
  }
}

export function gridReset(v: Voyage, now: number, fx: Fx[]): "generator-tripped" | null {
  const g = v.ship.grid;
  if (!g.down) return null;
  if (now < g.trippedUntil) return "generator-tripped";
  g.down = false;
  fx.push({ k: "gridReset" });
  note(v, "ENGINEER", "gridReset", "Generator reset");
  return null;
}

function tickGrid(v: Voyage, now: number, dt: number, fx: Fx[]): void {
  const g = v.ship.grid;
  if (g.down) {
    g.heat = Math.max(0, g.heat - GRID.coolRate * 0.5 * dt);
    return;
  }
  const over = gridLoad(v) - gridOutput(v);
  if (over > 0) {
    const before = g.heat;
    g.heat += GRID.heatPerOverload * over * rules(v).heat * dt;
    if (before < 70 && g.heat >= 70) fx.push({ k: "overheat" });
    if (g.heat >= 100) gridTrip(v, now, fx, "overload");
  } else {
    g.heat = Math.max(0, g.heat - GRID.coolRate * dt);
  }
}

// ------------------------------------------------------------- water

const pumpFor = (v: Voyage, c: Compartment): number => v.config.flood.pumpTo.indexOf(c);

/** A pump fails (relief burst or seized dry): it trips off and the seam
 * behind it cracks, leaking for the rest of the voyage. */
export function burst(v: Voyage, c: Compartment, fx: Fx[], why = "deadheaded"): void {
  const p = pumpFor(v, c);
  v.flood.pressure[c] = 0;
  v.flood.pumps[p] = false;
  mistake(v, FLOOD.dangerBurst);
  v.ship.seams[c] = Math.min(HULL.seamLeak * 3, v.ship.seams[c] + HULL.seamLeak);
  fx.push({ k: "burst", compartment: c, dry: why === "ran dry" });
  note(v, "SHIP", "burst", `${COMPARTMENT_LABEL[c]} pump failed (${why}); its seam now leaks`, "bad");
}

/** Water entering a compartment, %/s. */
export function inflowOf(v: Voyage, c: Compartment): number {
  const r = rules(v);
  const s = v.ship;
  let rate = v.config.flood.inflow[c] * r.inflow * (v.flood.stable ? HULL.shored : 1);
  rate += s.seams[c] + s.breach[c];
  if (v.phase === "ESCAPE") rate += FINALE.inflow * r.inflow;
  if (r.chain) {
    const i = COMPARTMENTS.indexOf(c);
    for (const n of [i - 1, i + 1]) if (COMPARTMENTS[n] && s.lost[COMPARTMENTS[n]]) rate += HULL.chainLeak;
  }
  return rate;
}

export function tickWater(v: Voyage, now: number, dt: number, fx: Fx[]): void {
  const f = v.flood;
  const s = v.ship;
  const powered = !shipLive(v) || gridUp(v);
  const drain = FLOOD.drainRate * rules(v).drain;
  f.prevLevels = { ...f.levels };
  for (const c of COMPARTMENTS) {
    if (s.lost[c]) {
      f.levels[c] = 100;
      f.pressure[c] = 0;
      continue;
    }
    const p = pumpFor(v, c);
    const switchOn = f.pumps[p];
    const running = switchOn && powered;
    const open = f.valves[c];
    let level = f.levels[c] + inflowOf(v, c) * dt;
    if (running && open) {
      level -= drain * dt;
      f.pressure[c] = relax(f.pressure[c], dt);
      f.dry[c] = level <= FLOOD.dryAt ? f.dry[c] + dt : 0;
      if (f.dry[c] >= FLOOD.dryRunS) {
        f.dry[c] = 0;
        f.seizedUntil[p] = now + FLOOD.seizeMs;
        burst(v, c, fx, "ran dry");
      }
    } else if (running && !open) {
      f.pressure[c] += FLOOD.pressureRise * dt;
      if (f.pressure[c] >= FLOOD.burstAt) burst(v, c, fx);
    } else if (!switchOn && open) {
      level += FLOOD.backflowRate * dt;
      // backflow reads as negative line pressure on the Engineer's gauge
      f.pressure[c] = -25;
    } else {
      // switch on but no power: the non-return valve holds, nothing moves
      f.pressure[c] = relax(f.pressure[c], dt);
    }
    if (!(running && open)) f.dry[c] = 0;
    f.levels[c] = Math.max(0, Math.min(100, level));
    if (f.levels[c] >= 100 && v.flood.stable && !s.lost[c]) {
      s.lost[c] = true;
      addDanger(v, HULL.dangerLost);
      fx.push({ k: "compartmentLost", compartment: c });
      note(v, "SHIP", "lost", `${COMPARTMENT_LABEL[c]} flooded completely and was lost`, "bad");
    }
    if (!s.peakLevel || f.levels[c] > s.peakLevel.level) s.peakLevel = { c, level: f.levels[c], t: Math.round(v.elapsedMs) };
  }
}

function relax(p: number, dt: number): number {
  const step = FLOOD.pressureRelax * dt;
  return Math.abs(p) <= step ? 0 : p - Math.sign(p) * step;
}

// ------------------------------------------------------------- Act IV

export function cascadeSeconds(v: Voyage): number {
  return v.ship.cascadeAtMs === null ? 0 : (v.elapsedMs - v.ship.cascadeAtMs) / 1000;
}

function tickCascade(v: Voyage, fx: Fx[]): void {
  const s = v.ship;
  const cfg = v.config.cascade;
  const t = cascadeSeconds(v);
  while (s.breachesDone < cfg.breaches.length && t >= cfg.breaches[s.breachesDone].atS) {
    const b = cfg.breaches[s.breachesDone++];
    if (s.lost[b.compartment]) continue;
    s.breach[b.compartment] += b.rate * rules(v).breach;
    fx.push({ k: "breach", compartment: b.compartment });
    note(v, "SHIP", "breach", `Hull breach in ${COMPARTMENT_LABEL[b.compartment]}`, "bad");
  }
  if (s.call !== null && t >= cfg.calls[s.call].atS + CASCADE.callWindowS) {
    s.call = null;
    s.callsMissed++;
    fx.push({ k: "callResult", answered: false });
    note(v, "SHIP", "callMissed", "A coast station's call went unanswered", "bad");
  }
  if (s.call === null && s.callsDone < cfg.calls.length && t >= cfg.calls[s.callsDone].atS) {
    s.call = s.callsDone++;
    fx.push({ k: "call" });
    note(v, "SHIP", "call", "A coast station is calling");
  }
}

function tickEvac(v: Voyage, dt: number, fx: Fx[]): void {
  const s = v.ship;
  if (!evacAvailable(v)) return;
  if (evacLive(v)) {
    const before = s.evac;
    s.evac = Math.min(100, s.evac + CASCADE.chargeRate * dt);
    if (before < 100 && s.evac >= 100) {
      fx.push({ k: "evacCharged" });
      note(v, "SHIP", "evacCharged", "Evac accumulator fully charged", "good");
    }
  } else if (v.phase === "ESCAPE") {
    s.evac = Math.max(0, s.evac - FINALE.evacDecay * dt);
    if (s.armed && s.evac <= 0) {
      s.armed = false;
      fx.push({ k: "davitsArmed", armed: false });
      note(v, "SHIP", "davits", "Davits lost hold: the accumulator ran dry", "bad");
    }
  }
}

/** Advances every live ship system by dt seconds. */
export function tickShip(v: Voyage, now: number, dt: number, fx: Fx[]): void {
  if (!shipLive(v)) return;
  tickGrid(v, now, dt, fx);
  tickWater(v, now, dt, fx);
  if (v.phase === "CASCADE") tickCascade(v, fx);
  tickEvac(v, dt, fx);
}
