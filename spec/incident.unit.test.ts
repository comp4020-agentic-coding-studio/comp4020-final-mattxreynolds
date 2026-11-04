// The compartment fire (docs/SYSTEMS.md, ADR 006): rules, idempotency,
// persistence, the secrecy split and blind-play simulations.

import { describe, expect, it } from "vitest";
import { INCIDENT, MODES } from "../shared/config.ts";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import type { Fx, Intent, Phase, Role } from "../shared/protocol.ts";
import { generatePuzzles } from "../server/game/puzzles.ts";
import { gridOutput } from "../server/game/ship.ts";
import { engineerView, navigatorView } from "../server/game/views.ts";
import { advance, applyIntent, createVoyage, tick, upgradeVoyage, type Voyage } from "../server/game/voyage.ts";
import { floodStep } from "./voyage.unit.test.ts";

function at(phase: Phase, seed = 42) {
  const t = { now: 1_000_000 };
  const v = createVoyage("id", "TEST", seed, t.now);
  v.unlocks = { modes: [...MODES], acts: 5 };
  v.seats.ENGINEER = { callsign: "ADA", ready: true };
  v.seats.NAVIGATOR = { callsign: "LIN", ready: true };
  advance(v, "LOBBY", t.now, []);
  v.phase = phase;
  v.flood.stable = true;
  if (phase === "CASCADE") v.ship.cascadeAtMs = v.elapsedMs;
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
type Sim = ReturnType<typeof at>;

/** Plays until the fire ignites. */
function ignite(s: Sim): void {
  s.run(s.v.config.incident.atS + 1);
  expect(s.v.ship.fire.state).toBe("burning");
}

const E = "ENGINEER" as const;
const throwOn = (s: Sim, i: number) => s.act(E, { t: "setIsolator", index: i, on: true });
const proc = (v: Voyage) => v.config.incident.procedures[v.config.incident.kind];

/** The talking crew: Engineer reads the class glyph, Bridge reads the book, Engineer throws. */
function talk(s: Sim): void {
  const { v } = s;
  const nav = navigatorView(v, {}, 0, s.t.now);
  const eng = engineerView(v, {}, 0, s.t.now);
  const entry = nav.fire.book.find((b) => b.kind === eng.fire.symptom)!;
  for (const g of entry.sequence) throwOn(s, eng.fire.isolators.findIndex((i) => i.glyph === g));
}

describe("the compartment fire: generation", () => {
  it("is seeded: distinct glyphs, distinct procedures, in range, deterministic", () => {
    for (let seed = 1; seed < 300; seed++) {
      const c = generatePuzzles(seed).incident;
      expect(new Set([...c.isolators, ...c.kinds]).size).toBe(INCIDENT.isolators + INCIDENT.kinds);
      expect(new Set(c.procedures.map((p) => p.join())).size).toBe(INCIDENT.kinds);
      for (const p of c.procedures) {
        expect(p).toHaveLength(INCIDENT.steps);
        expect(new Set(p).size).toBe(INCIDENT.steps);
      }
      expect(c.atS).toBeGreaterThanOrEqual(INCIDENT.atMinS);
      expect(c.atS).toBeLessThanOrEqual(INCIDENT.atMaxS);
      expect(COMPARTMENTS).toContain(c.compartment);
    }
    expect(generatePuzzles(9).incident).toEqual(generatePuzzles(9).incident);
    // every class and every compartment turns up across seeds
    const seen = Array.from({ length: 200 }, (_, i) => generatePuzzles(i + 1).incident);
    expect(new Set(seen.map((c) => c.kind)).size).toBe(INCIDENT.kinds);
    expect(new Set(seen.map((c) => c.compartment)).size).toBe(COMPARTMENTS.length);
  });
});

describe("the compartment fire: rules", () => {
  it("ignites on the seeded clock, only in Acts III-IV, and logs it", () => {
    const s = at("FLOOD");
    s.run(s.v.config.incident.atS + 5);
    expect(s.v.ship.fire.state).toBe("idle"); // Act II: the clock does not run
    const r = at("RADIO");
    const before = r.v.config.incident.atS;
    r.run(before - 2);
    expect(r.v.ship.fire.state).toBe("idle");
    const fx = r.run(4);
    expect(fx.some((f) => f.k === "fire" && f.ev === "ignite")).toBe(true);
    expect(r.v.log.some((e) => e.k === "fireIgnite")).toBe(true);
  });

  it("is deterministic from the seed plus time", () => {
    const a = at("RADIO", 5);
    const b = at("RADIO", 5);
    a.run(100);
    b.run(100);
    expect(a.v.ship.fire).toEqual(b.v.ship.fire);
  });

  it("the right isolators in the right order put it out and relieve danger", () => {
    const s = at("RADIO");
    ignite(s);
    const d = s.v.danger;
    const fx: Fx[] = [];
    for (const i of proc(s.v)) {
      const r = throwOn(s, i);
      expect(r.ok).toBe(true);
      if (r.ok) fx.push(...r.fx);
    }
    expect(s.v.ship.fire.state).toBe("out");
    expect(s.v.ship.fire.intensity).toBe(0);
    expect(s.v.danger).toBeLessThan(d);
    expect(fx.filter((f) => f.k === "fire" && f.ev === "step")).toHaveLength(INCIDENT.steps);
    expect(fx.some((f) => f.k === "fire" && f.ev === "out")).toBe(true);
    s.run(120);
    expect(s.v.ship.fire.state).toBe("out"); // it does not reignite
  });

  it("a wrong isolator flares the fire, resets the panel, locks it and costs danger", () => {
    const s = at("RADIO");
    ignite(s);
    const p = proc(s.v);
    throwOn(s, p[0]);
    const wrong = [0, 1, 2, 3, 4].find((i) => i !== p[1] && !p.slice(0, 1).includes(i))!;
    const before = s.v.ship.fire.intensity;
    const dg = s.v.danger;
    const r = throwOn(s, wrong);
    expect(r.ok && r.fx.some((f) => f.k === "fire" && f.ev === "flare")).toBe(true);
    expect(s.v.ship.fire.thrown).toEqual([]);
    expect(s.v.ship.fire.intensity).toBeGreaterThan(before + INCIDENT.flare - 1);
    expect(s.v.danger).toBeGreaterThan(dg);
    // locked: even the right first throw is refused for a while
    expect(throwOn(s, p[0])).toEqual({ ok: false, reason: "too-fast" });
    s.run(INCIDENT.lockMs / 1000 + 1);
    expect(throwOn(s, p[0]).ok).toBe(true);
  });

  it("ignored, it grows to flashover: a cracked seam and danger, not instant loss", () => {
    const s = at("CASCADE");
    ignite(s);
    const c = s.v.config.incident.compartment;
    const seam = s.v.ship.seams[c];
    s.run((100 - INCIDENT.startIntensity) / INCIDENT.growPerS + 5);
    expect(s.v.ship.fire.state).toBe("burnt");
    expect(s.v.ship.seams[c]).toBeGreaterThan(seam);
    expect(s.v.phase).not.toBe("LOST");
    expect(s.v.log.some((e) => e.k === "fireBurnout")).toBe(true);
    expect(throwOn(s, 0)).toEqual({ ok: false, reason: "wrong-phase" });
  });

  it("while burning it leaks into its compartment and derates a well-alight generator", () => {
    const s = at("RADIO");
    const quiet = gridOutput(s.v);
    ignite(s);
    s.run((INCIDENT.derateAt - INCIDENT.startIntensity) / INCIDENT.growPerS + 2);
    expect(gridOutput(s.v)).toBe(quiet - INCIDENT.derate);
    for (const i of proc(s.v)) throwOn(s, i);
    expect(gridOutput(s.v)).toBe(quiet);
  });

  it("the fire panel needs the grid up", () => {
    const s = at("RADIO");
    ignite(s);
    s.v.ship.grid.down = true;
    expect(throwOn(s, proc(s.v)[0])).toEqual({ ok: false, reason: "grid-down" });
  });
});

describe("the compartment fire: intents", () => {
  it("is Engineer-only, phase-gated and validates input", () => {
    const s = at("RADIO");
    ignite(s);
    expect(s.act("NAVIGATOR", { t: "setIsolator", index: 0, on: true })).toEqual({ ok: false, reason: "wrong-role" });
    for (const bad of [-1, 5, 1.5, "0", null, NaN]) {
      expect(s.act(E, { t: "setIsolator", index: bad as never, on: true })).toEqual({ ok: false, reason: "bad-input" });
    }
    expect(s.act(E, { t: "setIsolator", index: 0, on: "yes" as never })).toEqual({ ok: false, reason: "bad-input" });
    const f = at("FLOOD");
    expect(f.act(E, { t: "setIsolator", index: 0, on: true })).toEqual({ ok: false, reason: "wrong-phase" });
    // with nothing burning in a legal phase
    const q = at("RADIO");
    expect(q.act(E, { t: "setIsolator", index: 0, on: true })).toEqual({ ok: false, reason: "wrong-phase" });
  });

  it("is idempotent: repeating a correct throw changes nothing; re-arming is a set, not a toggle", () => {
    const s = at("RADIO");
    ignite(s);
    const p = proc(s.v);
    throwOn(s, p[0]);
    const snap = JSON.stringify(s.v.ship.fire);
    expect(throwOn(s, p[0]).ok).toBe(true);
    expect(JSON.stringify(s.v.ship.fire)).toBe(snap);
    expect(s.act(E, { t: "setIsolator", index: p[0], on: false }).ok).toBe(true);
    expect(s.v.ship.fire.thrown).toEqual([]);
    expect(s.act(E, { t: "setIsolator", index: p[0], on: false }).ok).toBe(true);
    expect(s.v.ship.fire.thrown).toEqual([]);
    expect(s.v.ship.fire.flares).toBe(0); // re-arming is free
  });

  it("no intent can assert the fire is out", () => {
    const s = at("RADIO");
    ignite(s);
    const r = s.act(E, { t: "setIsolator", index: 0, on: true, state: "out", intensity: 0 } as never);
    expect(s.v.ship.fire.intensity).toBeGreaterThan(0);
    void r;
  });
});

describe("the compartment fire: persistence", () => {
  it("survives a JSON round trip mid-fire and keeps burning", () => {
    const s = at("RADIO");
    ignite(s);
    throwOn(s, proc(s.v)[0]);
    s.run(5);
    const back = upgradeVoyage(JSON.parse(JSON.stringify(s.v)) as Voyage);
    expect(back.ship.fire).toEqual(s.v.ship.fire);
    expect(back.config.incident).toEqual(s.v.config.incident);
    const t2 = s.t.now + 1000;
    tick(back, t2);
    expect(back.ship.fire.state).toBe("burning");
    expect(back.ship.fire.intensity).toBeGreaterThan(s.v.ship.fire.intensity);
  });

  it("old saves without the fire load, gain the seeded incident and keep playing", () => {
    const s = at("RADIO", 11);
    const old = JSON.parse(JSON.stringify(s.v));
    delete old.ship.fire;
    delete old.config.incident;
    const up = upgradeVoyage(old);
    expect(up.ship.fire.state).toBe("idle");
    expect(up.config.incident).toEqual(generatePuzzles(11).incident);
    expect(() => tick(up, 2_000_000)).not.toThrow();
  });
});

describe("the compartment fire: secrecy", () => {
  it("each seat holds half: class glyph and switches vs. location and procedure book", () => {
    const s = at("RADIO");
    ignite(s);
    const { v } = s;
    const eng = engineerView(v, {}, 0, s.t.now);
    const nav = navigatorView(v, {}, 0, s.t.now);
    const eJson = JSON.stringify(eng);
    const nJson = JSON.stringify(nav);
    const inc = v.config.incident;
    // Engineer: symptom class, never the compartment, book or any order
    expect(eng.fire.symptom).toBe(inc.kinds[inc.kind]);
    expect(Object.keys(eng.fire).sort()).toEqual(["isolators", "locked", "smoke", "state", "symptom"]);
    expect(eJson).not.toContain("book");
    expect(eJson).not.toContain("sequence");
    expect(eJson).not.toContain("procedures");
    expect(eJson).not.toContain(JSON.stringify(inc.procedures));
    expect(eJson).not.toContain(`"compartment":"${inc.compartment}"`);
    // Navigator: location and book, never which class is burning
    expect(nav.fire.compartment).toBe(inc.compartment);
    expect(Object.keys(nav.fire).sort()).toEqual(["book", "compartment", "done", "intensity", "locked", "state", "steps"]);
    expect(nav.fire.book).toHaveLength(INCIDENT.kinds);
    expect(nJson).not.toContain("symptom");
    expect(nJson).not.toContain("isolators");
    expect(nJson).not.toContain('"kind":' + inc.kind); // no index of the burning class
    expect(nJson).not.toContain('"thrown"');
    // the book lists every class equally: nothing marks the live one
    expect(Object.keys(nav.fire.book[0]).sort()).toEqual(["kind", "sequence"]);
    // no procedure indices (the secret order as numbers) in either view
    expect(JSON.stringify(eng)).not.toContain('"procedures"');
  });

  it("before ignition neither view says where or what", () => {
    const s = at("RADIO");
    const eng = engineerView(s.v, {}, 0, s.t.now);
    const nav = navigatorView(s.v, {}, 0, s.t.now);
    expect(eng.fire.symptom).toBeNull();
    expect(nav.fire.compartment).toBeNull();
  });
});

// ------------------------------------------------------------ blind play

/** Outcome of a strategy played to the end of the fire's life (or 150 s). */
function outcome(s: Sim, step: (s: Sim) => void, maxS = 150): string {
  for (let i = 0; i < maxS * 2 && s.v.ship.fire.state === "burning"; i++) {
    step(s);
    s.run(0.5);
  }
  return s.v.ship.fire.state;
}

describe("the compartment fire: blind play", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);

  it("a talking crew puts it out on every seed", () => {
    for (const seed of seeds) {
      const s = at("RADIO", seed);
      ignite(s);
      s.run(2);
      talk(s);
      expect(s.v.ship.fire.state, `seed ${seed}`).toBe("out");
      expect(s.v.ship.fire.flares).toBe(0);
    }
  });

  it("an Engineer alone, fixed sweeps (every order of 0..4 in turn), does not put it out reliably", () => {
    let out = 0;
    const perms: number[][] = [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [1, 2, 3, 4, 0], [2, 0, 4, 1, 3], [3, 1, 4, 0, 2]];
    for (const seed of seeds) {
      for (const sweep of perms) {
        const s = at("RADIO", seed);
        ignite(s);
        let k = 0;
        // throw the sweep in order, re-arming and retrying the next order when it flares
        const res = outcome(s, (x) => {
          for (const i of sweep) throwOn(x, i);
          k++;
        });
        if (res === "out") out++;
      }
    }
    const rate = out / (seeds.length * perms.length);
    expect(rate).toBeLessThan(0.1);
  });

  it("an Engineer alone, reactive (reads which throws stuck, searches the next switch), loses most fires", () => {
    // The panel shows which isolators are thrown, so a prefix search is
    // possible: every dead end costs a flare and a lockout, and the fire only
    // gives it about two.
    let out = 0;
    let flashed = 0;
    for (const seed of seeds) {
      const s = at("RADIO", seed);
      ignite(s);
      const tried: number[][] = [[], [], [], []];
      const res = outcome(s, (x) => {
        if (x.v.elapsedMs < x.v.ship.fire.lockedUntilMs) return;
        const depth = x.v.ship.fire.thrown.length;
        const thrown = x.v.ship.fire.thrown;
        const next = [0, 1, 2, 3, 4].find((i) => !thrown.includes(i) && !tried[depth].includes(i));
        if (next === undefined) return;
        tried[depth].push(next);
        throwOn(x, next);
        if (x.v.ship.fire.thrown.length <= depth && x.v.ship.fire.flares > 0) {
          // flared: the whole panel reset, restart the prefix but keep what it learned
          const lastFlare = depth;
          for (let d = lastFlare + 1; d < 4; d++) tried[d] = [];
        }
      });
      if (res === "out") out++;
      if (res === "burnt") flashed++;
    }
    expect(out / seeds.length).toBeLessThan(0.35);
    expect(flashed).toBeGreaterThan(seeds.length / 2);
  });

  it("a Navigator alone can do nothing about it", () => {
    const s = at("RADIO");
    ignite(s);
    for (const t of ["setIsolator", "gridReset", "setValve"] as const) {
      const intent = t === "setIsolator" ? { t, index: 0, on: true } : t === "setValve" ? { t, compartment: "FORE" as const, open: true } : { t };
      expect(s.act("NAVIGATOR", intent as Intent).ok).toBe(false);
    }
    s.run(120);
    expect(s.v.ship.fire.state).toBe("burnt");
  });

  it("ignoring it is a cost, not a loss, for a crew that otherwise holds the ship", () => {
    const s = at("CASCADE", 3);
    ignite(s);
    for (let i = 0; i < 60; i++) {
      floodStep(s as never);
      s.run(0.5);
    }
    expect(s.v.phase).not.toBe("LOST");
  });
});
