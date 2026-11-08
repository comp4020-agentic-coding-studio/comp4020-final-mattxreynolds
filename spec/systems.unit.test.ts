// The ship simulation and the five-act structure (docs/SYSTEMS.md), driven
// through the pure reducer with a fake clock.

import { describe, expect, it } from "vitest";
import { CASCADE, FINALE, FLOOD, GRID, MODE_RULES, MODES } from "../shared/config.ts";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import type { Act, Fx, Intent, Phase, Role } from "../shared/protocol.ts";
import { generatePuzzles } from "../server/game/puzzles.ts";
import { gridLoad, gridOutput } from "../server/game/ship.ts";
import { advance, applyIntent, createVoyage, tick, upgradeVoyage, type Voyage } from "../server/game/voyage.ts";
import { navigatorView, engineerView } from "../server/game/views.ts";
import { floodStep, solveCascade, solveToRadio } from "./voyage.unit.test.ts";

function at(phase: Phase, seed = 42, opts: { practice?: Act; mode?: Voyage["mode"] } = {}) {
  const t = { now: 1_000_000 };
  const v = createVoyage("id", "TEST", seed, t.now, { mode: opts.mode });
  v.unlocks = { modes: [...MODES], acts: 5 };
  v.seats.ENGINEER = { callsign: "ADA", ready: true };
  v.seats.NAVIGATOR = { callsign: "LIN", ready: true };
  if (opts.practice) v.practice = opts.practice;
  advance(v, "LOBBY", t.now, []);
  if (!opts.practice) {
    v.phase = phase;
    if (phase === "CASCADE") v.ship.cascadeAtMs = v.elapsedMs;
    if (phase !== "FLOOD") v.flood.stable = true;
  }
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

describe("the five acts", () => {
  it("run in order: CASCADE sits between the distress call and the escape", () => {
    const s = solveToRadio(7);
    const { v, act } = s;
    act("NAVIGATOR", { t: "tune", channel: v.config.radio.resonance });
    act("ENGINEER", { t: "couple" });
    act("ENGINEER", { t: "setAntenna", bearing: v.config.radio.stations[v.config.radio.target].bearing });
    act("NAVIGATOR", { t: "transmit" });
    expect(v.phase).toBe("CASCADE");
    solveCascade(s as never);
    expect(v.phase).toBe("ESCAPE");
    expect(v.log.filter((e) => e.k === "act").map((e) => e.text)).toEqual([
      "Act I — Impact",
      "Act II — Stabilisation",
      "Act III — Mayday",
      "Act IV — Cascade",
      "Act V — Abandon Ship",
    ]);
  });

  it("event sequence numbers are strictly increasing", () => {
    const s = solveToRadio(3);
    const seqs = s.v.log.map((e) => e.seq);
    expect(seqs.length).toBeGreaterThan(3);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });
});

describe("the grid", () => {
  it("overload heats the generator until it trips; a trip kills the pumps and wears the machine", () => {
    const { v, act, run, t } = at("CASCADE");
    act("NAVIGATOR", { t: "setCircuit", circuit: "EVAC", on: true });
    act("NAVIGATOR", { t: "setPump", pump: 0, on: true });
    act("NAVIGATOR", { t: "setPump", pump: 1, on: true });
    act("ENGINEER", { t: "setValve", compartment: v.config.flood.pumpTo[0], open: true });
    act("ENGINEER", { t: "setValve", compartment: v.config.flood.pumpTo[1], open: true });
    // pumps 4 + EVAC 4 + RADIO 1 + LIGHTS 1 = 10, a healthy generator's output; one Act I trip makes it 9
    v.ship.powerTrips = 1;
    expect(gridLoad(v)).toBeGreaterThan(gridOutput(v));
    const before = gridOutput(v);
    const fx = run(20);
    expect(fx.some((f) => f.k === "gridTrip")).toBe(true);
    expect(v.ship.grid.down).toBe(true);
    expect(gridOutput(v)).toBe(before - GRID.wearPerGridTrip);
    // with the grid down, a pump's switch stays on but water doesn't drain
    const c = v.config.flood.pumpTo[0];
    const lvl = v.flood.levels[c];
    run(2);
    expect(v.flood.levels[c]).toBeGreaterThanOrEqual(lvl);
    // reset is refused until the trip cooldown passes, then works
    if (t.now < v.ship.grid.trippedUntil) expect(act("ENGINEER", { t: "gridReset" })).toMatchObject({ ok: false, reason: "generator-tripped" });
    t.now = v.ship.grid.trippedUntil + 1;
    expect(act("ENGINEER", { t: "gridReset" }).ok).toBe(true);
    expect(v.ship.grid.down).toBe(false);
  });

  it("shedding a circuit keeps the generator within output", () => {
    const { v, act, run } = at("CASCADE");
    v.ship.powerTrips = 1;
    act("NAVIGATOR", { t: "setCircuit", circuit: "EVAC", on: true });
    act("NAVIGATOR", { t: "setCircuit", circuit: "LIGHTS", on: false });
    act("NAVIGATOR", { t: "setPump", pump: 0, on: true });
    act("NAVIGATOR", { t: "setPump", pump: 1, on: true });
    expect(gridLoad(v)).toBeLessThanOrEqual(gridOutput(v));
    run(20);
    expect(v.ship.grid.trips).toBe(0);
  });

  it("Act I breaker trips derate the generator, but never below a solvable floor", () => {
    const { v } = at("CASCADE");
    v.ship.powerTrips = 9;
    v.ship.grid.trips = 9;
    expect(gridOutput(v)).toBe(GRID.minCapacity);
  });

  it("only the Bridge's distribution panel shows per-circuit draw; only the Engineer sees output and heat", () => {
    const { v } = at("CASCADE");
    const e = engineerView(v, {}, 1, 0);
    const n = navigatorView(v, {}, 1, 0);
    expect(e.grid.output).toBe(gridOutput(v));
    expect("grid" in n).toBe(false);
    expect(n.dist.draw.LIGHTS).toBe(GRID.load.lights);
    expect("dist" in e).toBe(false);
  });
});

describe("water", () => {
  it("a pump left drawing on an empty compartment seizes, cracks the seam and can't restart at once", () => {
    const { v, act, run } = at("FLOOD");
    const c = v.config.flood.pumpTo[0];
    v.flood.levels[c] = 2;
    act("ENGINEER", { t: "setValve", compartment: c, open: true });
    act("NAVIGATOR", { t: "setPump", pump: 0, on: true });
    const fx = run(FLOOD.dryRunS + 0.6);
    expect(fx).toContainEqual({ k: "burst", compartment: c, dry: true });
    expect(v.flood.pumps[0]).toBe(false);
    expect(v.ship.seams[c]).toBeGreaterThan(0);
    expect(act("NAVIGATOR", { t: "setPump", pump: 0, on: true })).toEqual({ ok: false, reason: "pump-seized" });
  });

  it("flood control completes only after the line is held, not on a momentary dip", () => {
    const { v, run } = at("FLOOD");
    for (const c of COMPARTMENTS) v.flood.levels[c] = 15;
    run(FLOOD.holdS - 1.2);
    expect(v.phase).toBe("FLOOD");
    run(2);
    expect(v.phase).toBe("RADIO");
  });

  it("a compartment that fills after Act II is lost for good, with a lump of danger", () => {
    const { v, run } = at("RADIO");
    v.flood.levels.CARGO = 99.9;
    v.ship.breach.CARGO = 2;
    const d = v.danger;
    const fx = run(1);
    expect(fx).toContainEqual({ k: "compartmentLost", compartment: "CARGO" });
    expect(v.ship.lost.CARGO).toBe(true);
    expect(v.danger).toBeGreaterThan(d + 9);
    run(5);
    expect(v.flood.levels.CARGO).toBe(100);
  });
});

describe("Act IV — Cascade", () => {
  it("breaches and calls are seeded, distinct and deterministic", () => {
    for (let seed = 1; seed < 300; seed++) {
      const c = generatePuzzles(seed).cascade;
      expect(new Set(c.breaches.map((b) => b.compartment)).size).toBe(CASCADE.breaches);
      for (let i = 1; i < c.breaches.length; i++) expect(c.breaches[i].atS).toBeGreaterThan(c.breaches[i - 1].atS);
      const stations = generatePuzzles(seed).radio.stations.map((s) => s.bearing);
      for (const call of c.calls) expect(stations).not.toContain(call.bearing);
      expect(c.calls[0].bearing).not.toBe(c.calls[1].bearing);
    }
    expect(generatePuzzles(5).cascade).toEqual(generatePuzzles(5).cascade);
  });

  it("a talking crew charges the accumulator on every seed tried", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = at("CASCADE", seed);
      s.v.ship.powerTrips = 2; // a crew that fumbled Act I
      solveCascade(s as never);
      expect(s.v.phase, `seed ${seed}`).toBe("ESCAPE");
    }
  });

  it("charging blind — EVAC on, nothing else managed — loses compartments and does not finish cleanly", () => {
    let lost = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { v, act, run } = at("CASCADE", seed);
      v.ship.powerTrips = 1;
      act("NAVIGATOR", { t: "setCircuit", circuit: "EVAC", on: true });
      // pumps fixed on the first two compartments, never moved, lights on
      act("NAVIGATOR", { t: "setPump", pump: 0, on: true });
      act("NAVIGATOR", { t: "setPump", pump: 1, on: true });
      act("ENGINEER", { t: "setValve", compartment: v.config.flood.pumpTo[0], open: true });
      act("ENGINEER", { t: "setValve", compartment: v.config.flood.pumpTo[1], open: true });
      run(180);
      lost += COMPARTMENTS.filter((c) => v.ship.lost[c]).length + v.ship.grid.trips;
    }
    expect(lost).toBeGreaterThan(6);
  });

  it("a coast-station call answers only with the antenna on the caller's bearing", () => {
    const { v, act, run } = at("CASCADE");
    const call = v.config.cascade.calls[0];
    run(call.atS + 0.5);
    expect(v.ship.call).toBe(0);
    expect(navigatorView(v, {}, 1, 0).call?.bearing).toBeTruthy();
    expect("call" in engineerView(v, {}, 1, 0)).toBe(false);
    act("ENGINEER", { t: "setAntenna", bearing: (call.bearing + 4) % 8 });
    act("NAVIGATOR", { t: "answerCall" });
    expect(v.ship.callsMissed).toBe(1);
    const second = v.config.cascade.calls[1];
    run(second.atS - call.atS);
    expect(v.ship.call).toBe(1);
    act("ENGINEER", { t: "setAntenna", bearing: second.bearing });
    expect(act("NAVIGATOR", { t: "answerCall" }).ok).toBe(true);
    expect(v.ship.callsAnswered).toBe(1);
    expect(act("NAVIGATOR", { t: "answerCall" })).toEqual({ ok: false, reason: "no-call" });
  });

  it("an unanswered call expires as missed", () => {
    const { v, run } = at("CASCADE");
    run(v.config.cascade.calls[0].atS + CASCADE.callWindowS + 1);
    expect(v.ship.callsMissed).toBeGreaterThanOrEqual(1);
  });
});

describe("Act V — the davits", () => {
  it("abandon is refused until the Bridge arms the davits, which needs live EVAC and half a charge", () => {
    const { v, act } = at("ESCAPE");
    v.escape.door = 100;
    expect(act("ENGINEER", { t: "abandon" })).toEqual({ ok: false, reason: "davits-not-armed" });
    expect(act("NAVIGATOR", { t: "armDavits" })).toEqual({ ok: false, reason: "evac-offline" });
    act("NAVIGATOR", { t: "setCircuit", circuit: "EVAC", on: true });
    v.ship.evac = FINALE.armCharge - 1;
    expect(act("NAVIGATOR", { t: "armDavits" })).toEqual({ ok: false, reason: "evac-low" });
    v.ship.evac = 80;
    expect(act("NAVIGATOR", { t: "armDavits" }).ok).toBe(true);
    expect(act("ENGINEER", { t: "abandon" }).ok).toBe(true);
    expect(act("NAVIGATOR", { t: "abandon" }).ok).toBe(true);
    expect(v.phase).toBe("SURVIVED");
    expect(v.debrief?.highlights.some((h) => h.label === "FINAL ESCAPE MARGIN")).toBe(true);
  });

  it("a grid trip mid-escape drops the davits", () => {
    const { v, act, run } = at("ESCAPE");
    act("NAVIGATOR", { t: "setCircuit", circuit: "EVAC", on: true });
    v.ship.evac = 100;
    act("NAVIGATOR", { t: "armDavits" });
    v.ship.grid.heat = 99;
    for (const p of [0, 1]) act("NAVIGATOR", { t: "setPump", pump: p, on: true });
    v.ship.powerTrips = 2;
    v.ship.grid.trips = 2; // output 6: EVAC holding 1 + davits 3 + pumps 4 + … is over
    run(2);
    expect(v.ship.grid.down).toBe(true);
    expect(v.ship.armed).toBe(false);
  });
});

describe("practice", () => {
  it("starts at the chosen act from a consistent, solved-earlier scenario", () => {
    for (const a of [2, 3, 4, 5] as Act[]) {
      const { v } = at("LOBBY", 11, { practice: a });
      expect(v.phase).toBe(["", "PROLOGUE", "FLOOD", "RADIO", "CASCADE", "ESCAPE"][a]);
      expect(v.power.online).toBe(true);
      if (a >= 3) expect(v.flood.stable).toBe(true);
      if (a >= 4) expect(v.radio.contact).toBe(true);
      if (a === 5) expect(v.ship.evac).toBe(100);
      expect(v.log.some((e) => e.k === "practice")).toBe(true);
    }
  });

  it("a practice escape is labelled as practice in the debrief", () => {
    const { v, act } = at("LOBBY", 11, { practice: 5 });
    v.escape.door = 100;
    act("NAVIGATOR", { t: "armDavits" });
    act("ENGINEER", { t: "abandon" });
    act("NAVIGATOR", { t: "abandon" });
    expect(v.phase).toBe("SURVIVED");
    expect(v.debrief?.practice).toBe(5);
  });

  it("the lobby only allows unlocked acts and modes", () => {
    const t = 1_000_000;
    const v = createVoyage("id", "T", 1, t);
    v.seats.ENGINEER = { callsign: "A", ready: true };
    expect(applyIntent(v, "ENGINEER", { t: "setStart", act: 3 }, t)).toEqual({ ok: false, reason: "locked" });
    expect(applyIntent(v, "ENGINEER", { t: "setMode", mode: "BLACKOUT" }, t)).toEqual({ ok: false, reason: "locked" });
    expect(applyIntent(v, "ENGINEER", { t: "setMode", mode: "NOPE" as never }, t)).toEqual({ ok: false, reason: "bad-input" });
    v.unlocks = { modes: ["STANDARD", "BLACKOUT"], acts: 3 };
    expect(applyIntent(v, "ENGINEER", { t: "setStart", act: 3 }, t).ok).toBe(true);
    expect(v.practice).toBe(3);
    expect(v.seats.ENGINEER.ready).toBe(false); // a change un-readies both
    expect(applyIntent(v, "ENGINEER", { t: "setMode", mode: "BLACKOUT" }, t).ok).toBe(true);
    expect(v.ship.circuits.LIGHTS).toBe(false); // Blackout starts with lighting shed
  });
});

describe("modes", () => {
  it("every mode keeps the Act IV objective achievable for a talking crew", () => {
    for (const mode of MODES) {
      const s = at("CASCADE", 21, { mode });
      solveCascade(s as never);
      expect(s.v.phase, mode).toBe("ESCAPE");
    }
  });

  it("modes only scale the shared systems", () => {
    for (const m of MODES) expect(Object.keys(MODE_RULES[m]).sort()).toEqual(Object.keys(MODE_RULES.STANDARD).sort());
  });
});

describe("debrief", () => {
  it("is built from what happened: trips, the distress time, lessons naming causes", () => {
    const s = solveToRadio(9);
    const { v, act, run } = s;
    // fumble the radio once, then lose
    act("NAVIGATOR", { t: "tune", channel: (v.config.radio.resonance + 2) % 24 });
    act("ENGINEER", { t: "couple" });
    v.danger = 99.9;
    run(4);
    expect(v.phase).toBe("LOST");
    const d = v.debrief!;
    expect(d.result).toBe("LOST");
    expect(d.lessons[0]).toContain("No distress call reached shore");
    expect(d.events.some((e) => e.k === "arc")).toBe(true);
    expect(d.highlights.find((h) => h.label === "DISTRESS SIGNAL")?.value).toBe("never sent");
    expect(d.samples.length).toBeGreaterThan(3);
    expect(JSON.stringify(d)).not.toContain('"solution"');
  });

  it("old saves without the ship systems load and keep playing", () => {
    const { v } = at("RADIO");
    const old = JSON.parse(JSON.stringify(v));
    delete old.ship;
    delete old.log;
    delete old.samples;
    delete old.mode;
    delete old.config.cascade;
    delete old.flood.dry;
    const up = upgradeVoyage(old);
    expect(up.ship.grid.heat).toBe(0);
    expect(up.config.cascade.breaches).toHaveLength(CASCADE.breaches);
    expect(() => tick(up, 2_000_000)).not.toThrow();
  });
});

const ended = (v: Voyage): boolean => v.phase === "LOST" || v.phase === "SURVIVED";

describe("invariants under random play", () => {
  it("random intents from both seats never break ranges, roles or terminal states", () => {
    const intents = (v: Voyage): [Role, Intent][] => [
      ["ENGINEER", { t: "setValve", compartment: COMPARTMENTS[Math.floor(Math.random() * 3)], open: Math.random() < 0.5 }],
      ["NAVIGATOR", { t: "setPump", pump: Math.floor(Math.random() * 3), on: Math.random() < 0.5 }],
      ["NAVIGATOR", { t: "setCircuit", circuit: (["LIGHTS", "RADIO", "EVAC"] as const)[Math.floor(Math.random() * 3)], on: Math.random() < 0.5 }],
      ["ENGINEER", { t: "gridReset" }],
      ["ENGINEER", { t: "setAntenna", bearing: Math.floor(Math.random() * 8) }],
      ["NAVIGATOR", { t: "answerCall" }],
      ["NAVIGATOR", { t: "armDavits" }],
      ["ENGINEER", { t: "pumpStroke" }],
      ["NAVIGATOR", { t: "holdDoor", held: Math.random() < 0.5 }],
      ["ENGINEER", { t: "abandon" }],
      ["NAVIGATOR", { t: "abandon" }],
      ["ENGINEER", { t: "setBreaker", index: Math.floor(Math.random() * 6), closed: Math.random() < 0.5 }],
      ["NAVIGATOR", { t: "tune", channel: Math.floor(Math.random() * 24) }],
      ["ENGINEER", { t: "couple" }],
      ["NAVIGATOR", { t: "transmit" }],
      ["NAVIGATOR", { t: "setCircuit", circuit: "toString" as never, on: true }],
      ["ENGINEER", { t: "setPump", pump: 0, on: true }], // wrong role
      ["NAVIGATOR", { t: "setValve", compartment: "FORE", open: true }], // wrong role
      ["ENGINEER", { t: "prologueBreaker" }],
      ["NAVIGATOR", { t: "prologueAck" }],
    ].slice(0, 20 + (v.seq % 1)) as [Role, Intent][];
    for (let seed = 1; seed <= 25; seed++) {
      const { v, act, run } = at("LOBBY", seed, { practice: undefined });
      v.phase = "PROLOGUE";
      let phases: Phase[] = [v.phase];
      for (let step = 0; step < 1500; step++) {
        const list = intents(v);
        const [role, intent] = list[Math.floor(Math.random() * list.length)];
        const before: Phase = v.phase;
        const r = act(role, intent);
        if (r.ok && (role === "ENGINEER" ? ["setPump", "setCircuit", "answerCall", "armDavits", "tune", "transmit", "holdDoor", "prologueAck"] : ["setValve", "gridReset", "setAntenna", "pumpStroke", "setBreaker", "couple", "prologueBreaker"]).includes(intent.t)) {
          throw new Error(`${role} was allowed ${intent.t}`);
        }
        run(0.4);
        if (v.phase !== before || v.phase !== phases[phases.length - 1]) phases.push(v.phase);
        for (const c of COMPARTMENTS) {
          expect(v.flood.levels[c]).toBeGreaterThanOrEqual(0);
          expect(v.flood.levels[c]).toBeLessThanOrEqual(100);
        }
        expect(v.danger).toBeGreaterThanOrEqual(0);
        expect(v.danger).toBeLessThanOrEqual(100);
        expect(v.ship.evac).toBeGreaterThanOrEqual(0);
        expect(v.ship.evac).toBeLessThanOrEqual(100);
        expect(v.ship.grid.heat).toBeGreaterThanOrEqual(0);
        if (ended(v)) break;
      }
      // phases only ever move forward, each at most once
      const order = ["PROLOGUE", "POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED", "LOST"];
      const idx = phases.map((p) => order.indexOf(p));
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
      // terminal states stay terminal
      const end: Phase = v.phase;
      if (ended(v)) {
        run(10);
        act("ENGINEER", { t: "setValve", compartment: "FORE", open: true });
        expect(v.phase).toBe(end);
      }
      // floodStep is safe to call in any phase
      floodStep({ v, act, run } as never);
    }
  });
});
