// Seeded generation of every phase's hidden configuration (docs/PUZZLES.md).

import { CASCADE, ESCAPE, FLOOD, INCIDENT, POWER, RADIO } from "../../shared/config.ts";
import { BEARINGS, COMPARTMENTS, GLYPHS, SYSTEMS, type Compartment, type Glyph, type Pulse, type ShipSystem } from "../../shared/glyphs.ts";
import { makeRng, type Rng } from "../../shared/rng.ts";

export type PowerConfig = {
  breakers: { glyph: Glyph; load: number }[];
  /** For each system, the two breaker indices that can feed it. */
  feeders: Record<ShipSystem, [number, number]>;
  shorted: number;
  capacity: number;
  /** The unique valid set of closed breakers (for tests and the log only). */
  solution: number[];
};

export type FloodConfig = {
  pumpGlyphs: Glyph[];
  /** pumpTo[pump] = the compartment that pump's pipework draws from. */
  pumpTo: Compartment[];
  inflow: Record<Compartment, number>;
  start: Record<Compartment, number>;
};

export type Station = { glyph: Glyph; pattern: Pulse; bearing: number };
export type RadioConfig = { resonance: number; stations: Station[]; target: number };

export type EscapeConfig = { band: [number, number] };

/** Act IV: when and where the hull gives way, and when coast stations call. */
export type CascadeConfig = {
  breaches: { atS: number; compartment: Compartment; rate: number }[];
  /** bearing = index into BEARINGS the Engineer's antenna must face to answer */
  calls: { atS: number; bearing: number }[];
};

/** The compartment fire. The Bridge reads `compartment` and `procedures`;
 * the Engineer reads only the class glyph and the isolator glyphs. */
export type IncidentConfig = {
  /** seconds into Act III (or Act IV for practice) when it ignites */
  atS: number;
  compartment: Compartment;
  /** index into `kinds`: the class actually burning */
  kind: number;
  /** glyph on each of the Engineer's isolator switches */
  isolators: Glyph[];
  /** symptom glyph of each fire class */
  kinds: Glyph[];
  /** per class: isolator indices to throw, in this order */
  procedures: number[][];
};

export type PuzzleConfig = {
  power: PowerConfig;
  flood: FloodConfig;
  radio: RadioConfig;
  escape: EscapeConfig;
  cascade: CascadeConfig;
  incident: IncidentConfig;
};

export function generatePuzzles(seed: number): PuzzleConfig {
  const rng = makeRng(seed);
  const power = generatePower(rng);
  const flood = generateFlood(rng);
  const radio = generateRadio(rng);
  const escape = generateEscape(rng);
  // drawn last so earlier phases keep the configurations they had before
  // Act IV existed (old saves and fixed test seeds stay meaningful)
  const cascade = generateCascade(makeRng(seed ^ 0x5eed_ca5c), radio);
  const incident = generateIncident(makeRng(seed ^ 0x1f1e_f12e));
  return { power, flood, radio, escape, cascade, incident };
}

/** Every way to close one non-shorted feeder per system. */
export function powerSelections(feeders: Record<ShipSystem, [number, number]>, shorted: number): number[][] {
  let out: number[][] = [[]];
  for (const s of SYSTEMS) {
    const options = feeders[s].filter((i) => i !== shorted);
    out = out.flatMap((sel) => options.map((i) => [...sel, i]));
  }
  return out;
}

function generatePower(rng: Rng): PowerConfig {
  for (;;) {
    const glyphs = rng.shuffle(GLYPHS).slice(0, POWER.breakers);
    const breakers = glyphs.map((glyph) => ({ glyph, load: rng.int(1, 3) }));
    const order = rng.shuffle([0, 1, 2, 3, 4, 5]);
    const feeders = {
      PUMPS: [order[0], order[1]],
      RADIO: [order[2], order[3]],
      HELM: [order[4], order[5]],
    } as Record<ShipSystem, [number, number]>;
    const shorted = rng.int(0, POWER.breakers - 1);
    const totals = powerSelections(feeders, shorted)
      .map((sel) => ({ sel, load: sel.reduce((n, i) => n + breakers[i].load, 0) }))
      .sort((a, b) => a.load - b.load);
    // Unique cheapest selection, and the cheapest must not simply be "all the
    // one-pip breakers" — otherwise the Engineer could solve it alone.
    if (totals[0].load === totals[1].load) continue;
    const ones = breakers.filter((b, i) => b.load === 1 && i !== shorted).length;
    if (ones === 3 && totals[0].load === 3) continue;
    // nor a run of three neighbours: closing breakers left to right must not
    // stumble onto the answer without talking to the Bridge
    const sol = totals[0].sel.slice().sort((a, b) => a - b);
    if (sol[2] - sol[0] === 2) continue;
    return { breakers, feeders, shorted, capacity: totals[0].load, solution: totals[0].sel.sort() };
  }
}

function generateFlood(rng: Rng): FloodConfig {
  const pumpGlyphs = rng.shuffle(GLYPHS).slice(0, 3);
  let pumpTo = rng.shuffle(COMPARTMENTS);
  // Never let pump order match the map's compartment order: the mapping
  // should have to be discovered, not assumed.
  while (pumpTo.every((c, i) => c === COMPARTMENTS[i])) pumpTo = rng.shuffle(COMPARTMENTS);
  const level = () => rng.int(FLOOD.startMin, FLOOD.startMax);
  const inflow = () => FLOOD.inflowMin + rng.next() * (FLOOD.inflowMax - FLOOD.inflowMin);
  return {
    pumpGlyphs,
    pumpTo,
    inflow: { FORE: inflow(), CARGO: inflow(), ENGINE: inflow() },
    start: { FORE: level(), CARGO: level(), ENGINE: level() },
  };
}

const samePulse = (a: Pulse, b: Pulse): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

function generateRadio(rng: Rng): RadioConfig {
  const glyphs = rng.shuffle(GLYPHS).slice(0, RADIO.stations);
  const bearings = rng.shuffle(BEARINGS.map((_, i) => i)).slice(0, RADIO.stations);
  const patterns: Pulse[] = [];
  while (patterns.length < RADIO.stations) {
    const len = rng.int(3, 4);
    const p = Array.from({ length: len }, () => rng.next() < 0.5);
    // All-short or all-long patterns are too easy to confuse when counting.
    if (p.every((x) => x) || p.every((x) => !x)) continue;
    if (!patterns.some((q) => samePulse(p, q))) patterns.push(p);
  }
  return {
    resonance: rng.int(RADIO.resonanceMin, RADIO.resonanceMax),
    stations: glyphs.map((glyph, i) => ({ glyph, pattern: patterns[i], bearing: bearings[i] })),
    target: rng.int(0, RADIO.stations - 1),
  };
}

function generateEscape(rng: Rng): EscapeConfig {
  const min = rng.pick(ESCAPE.bandMins);
  return { band: [min, min + ESCAPE.bandWidth] };
}

function generateCascade(rng: Rng, radio: RadioConfig): CascadeConfig {
  // Breaches: every compartment is hit once, in a seeded order, so a crew
  // can't pre-position both pumps and wait; the order must be read off the
  // Bridge's hull map each time.
  const order = rng.shuffle(COMPARTMENTS).slice(0, CASCADE.breaches);
  const breaches = order.map((compartment, i) => ({
    atS: CASCADE.firstBreachS + i * CASCADE.breachSpacingS + rng.int(-CASCADE.breachJitterS, CASCADE.breachJitterS) * (i ? 1 : 0),
    compartment,
    rate: CASCADE.breachRateMin + rng.next() * (CASCADE.breachRateMax - CASCADE.breachRateMin),
  }));
  // Calls come from bearings with no Act III station (8 bearings − 5
  // stations leaves 3), preferably two points apart, so the antenna must move.
  const free = BEARINGS.map((_, i) => i).filter((b) => !radio.stations.some((s) => s.bearing === b));
  const first = rng.pick(free);
  const apart = (b: number) => Math.min((b - first + 8) % 8, (first - b + 8) % 8) >= 2;
  const others = free.filter(apart);
  const second = rng.pick(others.length ? others : free.filter((b) => b !== first));
  const calls = [first, second].slice(0, CASCADE.calls).map((bearing, i) => ({
    atS: CASCADE.firstCallS + i * CASCADE.callSpacingS + rng.int(0, 4),
    bearing,
  }));
  return { breaches, calls };
}

function generateIncident(rng: Rng): IncidentConfig {
  // 5 isolator glyphs + 3 class glyphs use all eight, so no glyph is shared
  const glyphs = rng.shuffle(GLYPHS);
  const isolators = glyphs.slice(0, INCIDENT.isolators);
  const kinds = glyphs.slice(INCIDENT.isolators, INCIDENT.isolators + INCIDENT.kinds);
  const all = isolators.map((_, i) => i);
  const procedures: number[][] = [];
  while (procedures.length < kinds.length) {
    const p = rng.shuffle(all).slice(0, INCIDENT.steps);
    if (!procedures.some((q) => q.join() === p.join())) procedures.push(p);
  }
  return {
    atS: rng.int(INCIDENT.atMinS, INCIDENT.atMaxS),
    compartment: rng.pick(COMPARTMENTS),
    kind: rng.int(0, kinds.length - 1),
    isolators,
    kinds,
    procedures,
  };
}
