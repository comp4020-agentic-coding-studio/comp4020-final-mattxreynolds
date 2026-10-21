// The whole voyage played through the pure reducer with a fake clock: proves
// every phase is solvable as specified and transitions fire exactly once.

import { describe, expect, it } from "vitest";
import { POWER } from "../shared/config.ts";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import type { Fx, Intent, Role } from "../shared/protocol.ts";
import { generatePuzzles, powerSelections } from "../server/game/puzzles.ts";
import { advance, applyIntent, createVoyage, tick, type Voyage } from "../server/game/voyage.ts";

function setup(seed = 42): { v: Voyage; t: { now: number }; act: (r: Role, i: Intent) => ReturnType<typeof applyIntent>; run: (s: number) => Fx[] } {
  const t = { now: 1_000_000 };
  const v = createVoyage("id", "TEST", seed, t.now);
  v.seats.ENGINEER = { callsign: "ADA", ready: true };
  v.seats.NAVIGATOR = { callsign: "LIN", ready: true };
  advance(v, "LOBBY", t.now, []);
  const act = (r: Role, i: Intent) => applyIntent(v, r, i, t.now);
  const run = (seconds: number): Fx[] => {
    const fx: Fx[] = [];
    for (let i = 0; i < seconds * 5; i++) {
      t.now += 200;
      fx.push(...tick(v, t.now));
    }
    return fx;
  };
  return { v, t, act, run };
}

export function solveToRadio(seed = 42) {
  const s = setup(seed);
  const { v, act, run } = s;
  act("ENGINEER", { t: "prologueBreaker" });
  act("NAVIGATOR", { t: "prologueAck" });
  for (const i of v.config.power.solution) act("ENGINEER", { t: "setBreaker", index: i, closed: true });
  // flood: drain two compartments, then hand a pump to the third
  const order = COMPARTMENTS.slice();
  const pumpOf = (c: string) => v.config.flood.pumpTo.indexOf(c as never);
  for (const c of order.slice(0, 2)) {
    act("ENGINEER", { t: "setValve", compartment: c, open: true });
    act("NAVIGATOR", { t: "setPump", pump: pumpOf(c), on: true });
  }
  run(25);
  const [first] = order;
  act("NAVIGATOR", { t: "setPump", pump: pumpOf(first), on: false });
  act("ENGINEER", { t: "setValve", compartment: first, open: false });
  act("ENGINEER", { t: "setValve", compartment: order[2], open: true });
  act("NAVIGATOR", { t: "setPump", pump: pumpOf(order[2]), on: true });
  for (let i = 0; i < 60 && v.phase === "FLOOD"; i++) {
    run(1);
    // keep the first compartment from creeping back over the line
    if (v.phase === "FLOOD" && v.flood.levels[first] > 18 && v.flood.levels[order[2]] < 15) {
      act("NAVIGATOR", { t: "setPump", pump: pumpOf(order[2]), on: false });
      act("ENGINEER", { t: "setValve", compartment: order[2], open: false });
      act("ENGINEER", { t: "setValve", compartment: first, open: true });
      act("NAVIGATOR", { t: "setPump", pump: pumpOf(first), on: true });
    }
  }
  return s;
}

describe("puzzle generation", () => {
  it("every seed has exactly one cheapest power selection that avoids the short", () => {
    for (let seed = 1; seed < 300; seed++) {
      const p = generatePuzzles(seed).power;
      const loads = powerSelections(p.feeders, p.shorted).map((sel) => sel.reduce((n, i) => n + p.breakers[i].load, 0));
      expect(loads.filter((l) => l <= p.capacity)).toHaveLength(1);
      expect(p.solution).not.toContain(p.shorted);
    }
  });

  it("power can't be solved by sweeping breakers left to right (no answer is three neighbours)", () => {
    for (let seed = 1; seed < 2000; seed++) {
      const sol = generatePuzzles(seed).power.solution.slice().sort((a, b) => a - b);
      expect(sol[2] - sol[0], `seed ${seed}`).toBeGreaterThan(2);
    }
  });

  it("radio stations have distinct patterns and bearings; the target is one of them", () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = generatePuzzles(seed).radio;
      const pats = new Set(r.stations.map((s) => s.pattern.join()));
      const bearings = new Set(r.stations.map((s) => s.bearing));
      expect(pats.size).toBe(5);
      expect(bearings.size).toBe(5);
      expect(r.target).toBeGreaterThanOrEqual(0);
      expect(r.target).toBeLessThan(5);
    }
  });

  it("the same seed generates the same puzzles", () => {
    expect(generatePuzzles(7)).toEqual(generatePuzzles(7));
  });
});

describe("a full voyage", () => {
  it("is solvable end to end, each phase entered exactly once", () => {
    for (const seed of [1, 42, 99, 1234]) {
      const s = solveToRadio(seed);
      const { v, act, run, t } = s;
      expect(v.phase, `seed ${seed}`).toBe("RADIO");
      // tune to resonance and couple
      act("NAVIGATOR", { t: "tune", channel: v.config.radio.resonance });
      expect(act("ENGINEER", { t: "couple" }).ok).toBe(true);
      const target = v.config.radio.stations[v.config.radio.target];
      act("ENGINEER", { t: "setAntenna", bearing: target.bearing });
      act("NAVIGATOR", { t: "transmit" });
      expect(v.phase).toBe("ESCAPE");
      // pressurise into band, hold the door, keep pumping
      const [lo] = v.config.escape.band;
      act("NAVIGATOR", { t: "holdDoor", held: true });
      for (let i = 0; i < 200 && v.escape.door < 100; i++) {
        if (v.escape.pressure < lo + 4) {
          t.now += 200;
          act("ENGINEER", { t: "pumpStroke" });
        }
        run(0.2);
      }
      expect(v.escape.door).toBe(100);
      act("ENGINEER", { t: "abandon" });
      t.now += 1500;
      act("NAVIGATOR", { t: "abandon" });
      expect(v.phase).toBe("SURVIVED");
      expect(Object.keys(v.phaseTimes)).toEqual(["PROLOGUE", "POWER", "FLOOD", "RADIO", "ESCAPE", "SURVIVED"]);
      expect(v.danger).toBeLessThan(100);
    }
  });
});

describe("rules", () => {
  it("closing the shorted breaker trips the generator and blocks closing for a while", () => {
    const { v, act, t } = setup();
    act("ENGINEER", { t: "prologueBreaker" });
    act("NAVIGATOR", { t: "prologueAck" });
    const r = act("ENGINEER", { t: "setBreaker", index: v.config.power.shorted, closed: true });
    expect(r).toMatchObject({ ok: true, fx: [{ k: "trip", cause: "short" }] });
    expect(v.power.closed.every((c) => !c)).toBe(true);
    expect(act("ENGINEER", { t: "setBreaker", index: 0, closed: true })).toEqual({ ok: false, reason: "generator-tripped" });
    t.now += POWER.tripMs + 100;
    expect(act("ENGINEER", { t: "setBreaker", index: v.config.power.solution[0], closed: true }).ok).toBe(true);
    expect(v.mistakes).toBe(1);
  });

  it("three breakers that don't feed every system backfeed and trip (no free guessing)", () => {
    const { v, act } = setup();
    act("ENGINEER", { t: "prologueBreaker" });
    act("NAVIGATOR", { t: "prologueAck" });
    const p = v.config.power;
    // both feeders of one system plus one other non-shorted breaker
    const [a, b] = p.feeders.PUMPS;
    const c = [0, 1, 2, 3, 4, 5].find((i) => i !== a && i !== b && i !== p.shorted)!;
    const loads = [a, b, c].reduce((n, i) => n + p.breakers[i].load, 0);
    if (a === p.shorted || b === p.shorted || loads > p.capacity) return; // other rules fire first
    act("ENGINEER", { t: "setBreaker", index: a, closed: true });
    act("ENGINEER", { t: "setBreaker", index: b, closed: true });
    const r = act("ENGINEER", { t: "setBreaker", index: c, closed: true });
    expect(r).toMatchObject({ ok: true, fx: [{ k: "trip", cause: "backfeed" }] });
    expect(v.power.closed.every((x) => !x)).toBe(true);
  });

  it("only two pumps may run; deadheading bursts and trips the pump", () => {
    const { v, act, run } = setup();
    v.phase = "FLOOD";
    act("NAVIGATOR", { t: "setPump", pump: 0, on: true });
    act("NAVIGATOR", { t: "setPump", pump: 1, on: true });
    expect(act("NAVIGATOR", { t: "setPump", pump: 2, on: true })).toEqual({ ok: false, reason: "pump-bus-limit" });
    const fx = run(6); // valves shut → deadhead → burst at 100
    expect(fx.filter((f) => f.k === "burst")).toHaveLength(2);
    expect(v.flood.pumps).toEqual([false, false, false]);
  });

  it("an open valve with its pump off backflows (level rises, gauge negative)", () => {
    const { v, act, run } = setup();
    v.phase = "FLOOD";
    const before = v.flood.levels.CARGO;
    act("ENGINEER", { t: "setValve", compartment: "CARGO", open: true });
    run(2);
    expect(v.flood.levels.CARGO).toBeGreaterThan(before + 2);
    expect(v.flood.pressure.CARGO).toBeLessThan(0);
  });

  it("coupling off resonance arcs and costs danger, tuning is frozen once coupled", () => {
    const { v, act } = setup();
    v.phase = "RADIO";
    const d = v.danger;
    act("NAVIGATOR", { t: "tune", channel: (v.config.radio.resonance + 3) % 24 });
    expect(act("ENGINEER", { t: "couple" })).toMatchObject({ ok: true, fx: [{ k: "arc" }] });
    expect(v.danger).toBeGreaterThan(d);
    act("NAVIGATOR", { t: "tune", channel: v.config.radio.resonance });
    act("ENGINEER", { t: "couple" });
    expect(act("NAVIGATOR", { t: "tune", channel: 0 })).toEqual({ ok: false, reason: "carrier-locked" });
  });

  it("transmitting at the wrong station is a mistake; at the target completes", () => {
    const { v, act } = setup();
    v.phase = "RADIO";
    act("NAVIGATOR", { t: "tune", channel: v.config.radio.resonance });
    act("ENGINEER", { t: "couple" });
    const wrong = v.config.radio.stations.find((_, i) => i !== v.config.radio.target)!;
    act("ENGINEER", { t: "setAntenna", bearing: wrong.bearing });
    act("NAVIGATOR", { t: "transmit" });
    expect(v.radio.lastReply).toBe("wrong-station");
    expect(v.phase).toBe("RADIO");
  });

  it("flood needs talking: every valve open while rotating pumps never drains the ship", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { v, act, run } = setup(seed);
      v.phase = "FLOOD";
      for (const c of COMPARTMENTS) act("ENGINEER", { t: "setValve", compartment: c, open: true });
      const pairs = [[0, 1], [1, 2], [0, 2]];
      for (let r = 0; r < 15 && v.phase === "FLOOD"; r++) {
        for (const p of [0, 1, 2]) act("NAVIGATOR", { t: "setPump", pump: p, on: false });
        for (const p of pairs[r % 3]) act("NAVIGATOR", { t: "setPump", pump: p, on: true });
        run(20);
      }
      expect(v.phase, `seed ${seed}`).not.toBe("RADIO");
    }
  });

  it("escape needs talking: blind steady pumping with release held never opens the door", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { v, act, run, t } = setup(seed);
      v.phase = "ESCAPE";
      act("NAVIGATOR", { t: "holdDoor", held: true });
      // a stroke every 600 ms for 60 s
      for (let i = 0; i < 100; i++) {
        act("ENGINEER", { t: "pumpStroke" });
        run(0.6);
      }
      expect(v.escape.door, `seed ${seed}`).toBeLessThan(100);
    }
  });

  it("a lone abandon pull expires; pulls further apart than the window do not escape", () => {
    const { v, act, run, t } = setup();
    v.phase = "ESCAPE";
    v.escape.door = 100;
    act("ENGINEER", { t: "abandon" });
    run(3.4);
    expect(v.escape.abandonAt.ENGINEER).toBeUndefined();
    t.now += 10;
    act("NAVIGATOR", { t: "abandon" });
    expect(v.phase).toBe("ESCAPE");
  });

  it("phase completion fires once even when the predicate is re-checked", () => {
    const { v, act } = setup();
    const r1 = act("ENGINEER", { t: "prologueBreaker" });
    const r2 = act("NAVIGATOR", { t: "prologueAck" });
    const r3 = act("NAVIGATOR", { t: "prologueAck" });
    const phases = [r1, r2, r3].flatMap((r) => (r.ok ? r.fx.filter((f) => f.k === "phase") : []));
    expect(phases).toEqual([{ k: "phase", phase: "POWER" }]);
    expect(r3).toMatchObject({ ok: false, reason: "wrong-phase" });
  });

  it("danger reaching 100 loses the voyage with a cause naming the phase", () => {
    const { v, run } = setup();
    v.phase = "RADIO";
    v.danger = 99.9;
    run(2);
    expect(v.phase).toBe("LOST");
    expect(v.failureCause).toBe("No distress call reached shore");
  });

  it("a paused voyage does not take on water", () => {
    const { v, run } = setup();
    v.phase = "RADIO";
    v.paused = true;
    const d = v.danger;
    run(10);
    expect(v.danger).toBe(d);
  });

  it("a long gap between ticks is capped (restart reads as a pause)", () => {
    const { v, t } = setup();
    v.phase = "RADIO";
    const d = v.danger;
    t.now += 600_000;
    tick(v, t.now);
    expect(v.danger - d).toBeLessThan(0.2);
  });

  it("rejects malformed intents", () => {
    const { act } = setup();
    expect(act("ENGINEER", { t: "nope" } as never)).toEqual({ ok: false, reason: "bad-input" });
    expect(act("ENGINEER", null as never)).toEqual({ ok: false, reason: "bad-input" });
  });

  it("intent types named after Object.prototype members are rejected, not thrown", () => {
    // regression: INTENT_RULES["toString"] used to resolve through the
    // prototype and throw, crashing the server from one client message
    const { act } = setup();
    for (const t of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(act("ENGINEER", { t } as never)).toEqual({ ok: false, reason: "bad-input" });
    }
    expect(act("ENGINEER", { t: 7 } as never)).toEqual({ ok: false, reason: "bad-input" });
  });
});
