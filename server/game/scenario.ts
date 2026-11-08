// Controlled scenario setup for practice runs: a voyage that starts at a
// later act is given the state a crew who had solved the earlier acts
// cleanly would leave behind. Built from the voyage's own seeded config, not
// from a saved snapshot, so it can never restore something inconsistent.

import { CASCADE, DANGER, FLOOD } from "../../shared/config.ts";
import { COMPARTMENTS } from "../../shared/glyphs.ts";
import { phaseIndex, type Phase } from "../../shared/protocol.ts";
import type { Voyage } from "./state.ts";

/** Danger a clean crew would carry into each act. */
const START_DANGER: Partial<Record<Phase, number>> = {
  FLOOD: DANGER.start + 4,
  RADIO: 16,
  CASCADE: 18,
  ESCAPE: 24,
};

export function prepareStart(v: Voyage, start: Phase): void {
  const at = (p: Phase) => phaseIndex(start) > phaseIndex(p);
  v.danger = START_DANGER[start] ?? DANGER.start;
  if (at("PROLOGUE")) v.prologue = { busOn: true, acknowledged: true };
  if (at("POWER")) {
    v.power.closed = v.power.closed.map((_, i) => v.config.power.solution.includes(i));
    v.power.online = true;
  }
  if (at("FLOOD")) {
    v.flood.stable = true;
    for (const c of COMPARTMENTS) {
      v.flood.levels[c] = 10 + COMPARTMENTS.indexOf(c) * 3;
      v.flood.valves[c] = false;
    }
    v.flood.prevLevels = { ...v.flood.levels };
    v.flood.pumps = [false, false, false];
  }
  if (at("RADIO")) {
    v.radio.channel = v.config.radio.resonance;
    v.radio.coupled = true;
    v.radio.antenna = v.config.radio.stations[v.config.radio.target].bearing;
    v.radio.contact = true;
    v.radio.lastReply = "contact";
  }
  if (at("CASCADE")) {
    // the accumulator charged, every breach happened, the calls came and went
    const s = v.ship;
    s.evac = 100;
    s.circuits.EVAC = true;
    s.cascadeAtMs = 0;
    s.breachesDone = v.config.cascade.breaches.length;
    for (const b of v.config.cascade.breaches) s.breach[b.compartment] += b.rate;
    s.callsDone = CASCADE.calls;
    s.callsAnswered = 1;
    s.callsMissed = 1;
    // pumps already running on the two worst breaches, valves open to match
    const worst = v.config.cascade.breaches
      .slice()
      .sort((a, b) => b.rate - a.rate)
      .slice(0, FLOOD.maxPumps)
      .map((b) => b.compartment);
    for (const c of worst) {
      v.flood.valves[c] = true;
      v.flood.pumps[v.config.flood.pumpTo.indexOf(c)] = true;
    }
  }
}
