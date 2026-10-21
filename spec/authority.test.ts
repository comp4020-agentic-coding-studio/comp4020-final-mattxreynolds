// Promise: the server owns canonical state. Clients send intents, never truth;
// no intent can assert completion; malformed, wrong-role, wrong-phase and
// stale inputs are rejected with a reason; simultaneous inputs are serialised
// and each phase transition fires exactly once (CLAUDE.md invariants 1, 4, 5).

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EngineerView, Intent, NavigatorView } from "../shared/protocol.ts";
import {
  events,
  hidden,
  jump,
  launch,
  strangerSocket,
  survive,
  throughPrologue,
  type Player,
} from "./helpers/client.ts";
import { startServer, type TestServer } from "./helpers/server.ts";

let server: TestServer;
let open: Player[] = [];
beforeAll(async () => {
  server = await startServer({ testHooks: true });
});
afterEach(() => {
  open.forEach((p) => p.close());
  open = [];
});
afterAll(async () => {
  await server?.dispose();
});
const track = <T extends Player[]>(ps: T): T => {
  open.push(...ps);
  return ps;
};
/** Sends anything at all as an intent — the wire does not enforce types. */
const raw = (p: Player, intent: unknown) => p.send(intent as Intent);

async function inPower(): Promise<[Player, Player]> {
  const [eng, nav] = track(await launch(server.url));
  await throughPrologue(eng, nav);
  return [eng, nav];
}

describe("a client cannot force completion", () => {
  it("unknown intent types are rejected and change nothing", async () => {
    const [eng, nav] = await inPower();
    for (const t of ["complete", "win", "setPhase", "advance", "__proto__", "constructor", "toString"]) {
      expect(await raw(eng, { t }), t).toMatchObject({ ok: false, reason: "bad-input" });
      expect(await raw(nav, { t, phase: "SURVIVED" }), t).toMatchObject({ ok: false, reason: "bad-input" });
    }
    expect(await raw(eng, {})).toMatchObject({ ok: false, reason: "bad-input" });
    expect(await raw(eng, null)).toMatchObject({ ok: false, reason: "bad-input" });
    expect(await raw(eng, "setBreaker")).toMatchObject({ ok: false, reason: "bad-input" });
    expect((await hidden(server.url, eng.code)).phase).toBe("POWER");
  });

  it("extra fields asserting completion are ignored", async () => {
    const [eng] = await inPower();
    const cfg = (await hidden(server.url, eng.code)).config;
    const index = cfg.power.solution[0];
    const res = await raw(eng, { t: "setBreaker", index, closed: true, complete: true, phase: "SURVIVED", online: true });
    expect(res.ok).toBe(true);
    const v = await hidden(server.url, eng.code);
    expect(v.phase).toBe("POWER");
    expect(v.power.online).toBe(false);
    expect(v.power.closed.filter(Boolean)).toHaveLength(1);
  });

  it("out-of-range and mistyped payloads are rejected bad-input", async () => {
    const [eng, nav] = await inPower();
    const bad: [Player, unknown][] = [
      [eng, { t: "setBreaker", index: 99, closed: true }],
      [eng, { t: "setBreaker", index: -1, closed: true }],
      [eng, { t: "setBreaker", index: 1.5, closed: true }],
      [eng, { t: "setBreaker", index: "0", closed: true }],
      [eng, { t: "setBreaker", index: 0, closed: "true" }],
      [eng, { t: "setBreaker", index: 0 }],
    ];
    for (const [p, i] of bad) expect(await raw(p, i), JSON.stringify(i)).toMatchObject({ ok: false, reason: "bad-input" });

    await jump(server.url, [eng, nav], { phase: "FLOOD" });
    const badFlood: [Player, unknown][] = [
      [eng, { t: "setValve", compartment: "BRIDGE", open: true }],
      [eng, { t: "setValve", compartment: "cargo", open: true }],
      [eng, { t: "setValve", compartment: "CARGO", open: 1 }],
      [nav, { t: "setPump", pump: 3, on: true }],
      [nav, { t: "setPump", pump: 0, on: "yes" }],
    ];
    for (const [p, i] of badFlood) expect(await raw(p, i), JSON.stringify(i)).toMatchObject({ ok: false, reason: "bad-input" });

    await jump(server.url, [eng, nav], { phase: "RADIO" });
    const badRadio: [Player, unknown][] = [
      [nav, { t: "tune", channel: -1 }],
      [nav, { t: "tune", channel: 24 }],
      [nav, { t: "tune", channel: "3" }],
      [eng, { t: "setAntenna", bearing: 8 }],
      [eng, { t: "setAntenna", bearing: "N" }],
    ];
    for (const [p, i] of badRadio) expect(await raw(p, i), JSON.stringify(i)).toMatchObject({ ok: false, reason: "bad-input" });

    await jump(server.url, [eng, nav], { phase: "ESCAPE" });
    expect(await raw(nav, { t: "holdDoor", held: "true" })).toMatchObject({ ok: false, reason: "bad-input" });

    await jump(server.url, [eng, nav], { phase: "LOBBY" });
    expect(await raw(eng, { t: "setReady", ready: "yes" })).toMatchObject({ ok: false, reason: "bad-input" });

    const v = await hidden(server.url, eng.code);
    expect(v.flood.valves).toEqual({ FORE: false, CARGO: false, ENGINE: false });
    expect(v.radio.channel).toBe(0);
    expect(v.radio.antenna).toBe(0);
  });

  it("malformed intent envelopes are rejected bad-input", async () => {
    const [eng] = await inPower();
    for (const msg of [null, 42, "x", {}, { seq: 1 }, { seq: 1, intent: "setBreaker" }]) {
      const ack = await eng.socket.timeout(4000).emitWithAck("intent", msg);
      expect(ack, JSON.stringify(msg)).toMatchObject({ ok: false, reason: "bad-input" });
    }
  });

  it("each control belongs to one role", async () => {
    const [eng, nav] = await inPower();
    expect(await nav.send({ t: "setBreaker", index: 0, closed: true })).toMatchObject({ ok: false, reason: "wrong-role" });
    await jump(server.url, [eng, nav], { phase: "FLOOD" });
    expect(await nav.send({ t: "setValve", compartment: "FORE", open: true })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await eng.send({ t: "setPump", pump: 0, on: true })).toMatchObject({ ok: false, reason: "wrong-role" });
    await jump(server.url, [eng, nav], { phase: "RADIO" });
    expect(await eng.send({ t: "tune", channel: 3 })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await eng.send({ t: "transmit" })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await nav.send({ t: "couple" })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await nav.send({ t: "setAntenna", bearing: 2 })).toMatchObject({ ok: false, reason: "wrong-role" });
    await jump(server.url, [eng, nav], { phase: "ESCAPE" });
    expect(await nav.send({ t: "pumpStroke" })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await eng.send({ t: "holdDoor", held: true })).toMatchObject({ ok: false, reason: "wrong-role" });
  });

  it("a control only works in its own phase", async () => {
    const [eng, nav] = await inPower();
    expect(await eng.send({ t: "setValve", compartment: "FORE", open: true })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await nav.send({ t: "tune", channel: 3 })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await eng.send({ t: "abandon" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await nav.send({ t: "sailAgain" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await eng.send({ t: "setReady", ready: true })).toMatchObject({ ok: false, reason: "wrong-phase" });
  });

  it("a socket that never said hello is not seated", async () => {
    const [eng] = await inPower();
    const s = await strangerSocket(server.url);
    try {
      let viewed = false;
      s.on("view", () => (viewed = true));
      for (const intent of [{ t: "setBreaker", index: 0, closed: true }, { t: "sailAgain" }, { t: "setReady", ready: true }]) {
        const ack = await s.timeout(4000).emitWithAck("intent", { seq: 1, intent });
        expect(ack).toMatchObject({ ok: false, reason: "not-seated" });
      }
      // a failed hello does not seat it either
      const hello = await s.timeout(4000).emitWithAck("hello", { code: eng.code, token: "forged" });
      expect(hello).toMatchObject({ ok: false, reason: "bad-token" });
      const ack = await s.timeout(4000).emitWithAck("intent", { seq: 2, intent: { t: "setBreaker", index: 0, closed: true } });
      expect(ack).toMatchObject({ ok: false, reason: "not-seated" });
      expect(viewed).toBe(false);
      expect((await hidden(server.url, eng.code)).power.closed.some(Boolean)).toBe(false);
    } finally {
      s.close();
    }
  });
});

describe("stale inputs are refused", () => {
  it("an intent for a phase that has ended is wrong-phase", async () => {
    const [eng, nav] = await inPower();
    // a late prologue press, arriving after the transition
    expect(await eng.send({ t: "prologueBreaker" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await nav.send({ t: "prologueAck" })).toMatchObject({ ok: false, reason: "wrong-phase" });
  });

  it("after SURVIVED or LOST, play intents are rejected", async () => {
    const [eng, nav] = track(await launch(server.url));
    await survive(server.url, eng, nav);
    expect(await eng.send({ t: "abandon" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await nav.send({ t: "holdDoor", held: true })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await eng.send({ t: "pumpStroke" })).toMatchObject({ ok: false, reason: "wrong-phase" });

    const [eng2, nav2] = track(await launch(server.url));
    await jump(server.url, [eng2, nav2], { phase: "RADIO", deepestPhase: "RADIO", danger: 99.95 });
    await eng2.waitFor((v) => v.phase === "LOST", 8000);
    expect(await nav2.send({ t: "transmit" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect(await eng2.send({ t: "couple" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    expect((await hidden(server.url, eng2.code)).phase).toBe("LOST");
  });
});

describe("simultaneous inputs are serialised; transitions fire once", () => {
  it("both pull ABANDON at the same instant → exactly one SURVIVED", async () => {
    const [eng, nav] = track(await launch(server.url));
    await jump(server.url, [eng, nav], { phase: "ESCAPE", deepestPhase: "ESCAPE", escape: { door: 100 }, ship: { armed: true, evac: 100, circuits: { EVAC: true } } });
    const acks = await Promise.all([
      ...Array.from({ length: 5 }, () => eng.send({ t: "abandon" })),
      ...Array.from({ length: 5 }, () => nav.send({ t: "abandon" })),
    ]);
    // the first pair lands, any that arrive after the transition are stale
    expect(acks.filter((a) => a.ok).length).toBeGreaterThanOrEqual(2);
    for (const a of acks) if (!a.ok) expect(a.reason).toBe("wrong-phase");
    await eng.waitFor((v) => v.phase === "SURVIVED");
    await nav.waitFor((v) => v.phase === "SURVIVED");
    const log = await events(server.url, eng.code);
    expect(log.filter((e) => e.kind === "phase" && e.detail === "SURVIVED")).toHaveLength(1);
    expect(log.filter((e) => e.kind === "ended")).toHaveLength(1);
  });

  it("ten concurrent acknowledges → exactly one POWER transition", async () => {
    const [eng, nav] = track(await launch(server.url));
    await eng.send({ t: "prologueBreaker" });
    await nav.waitFor((v) => v.prologue.busOn);
    const acks = await Promise.all(Array.from({ length: 10 }, () => nav.send({ t: "prologueAck" })));
    expect(acks.filter((a) => a.ok).length).toBe(1);
    for (const a of acks) if (!a.ok) expect(a.reason).toBe("wrong-phase");
    await eng.waitFor((v) => v.phase === "POWER");
    const log = await events(server.url, eng.code);
    expect(log.filter((e) => e.kind === "phase" && e.detail === "POWER")).toHaveLength(1);
    expect(log.filter((e) => e.kind === "phase" && e.detail === "PROLOGUE")).toHaveLength(1);
    expect(log.filter((e) => e.kind === "started")).toHaveLength(1);
  });

  it("both players racing on their own controls never break a rule", async () => {
    const [eng, nav] = track(await launch(server.url));
    await jump(server.url, [eng, nav], { phase: "FLOOD" });
    const acks = await Promise.all([
      nav.send({ t: "setPump", pump: 0, on: true }),
      nav.send({ t: "setPump", pump: 1, on: true }),
      nav.send({ t: "setPump", pump: 2, on: true }),
      eng.send({ t: "setValve", compartment: "FORE", open: true }),
      eng.send({ t: "setValve", compartment: "CARGO", open: true }),
      eng.send({ t: "setValve", compartment: "ENGINE", open: true }),
    ]);
    const pumpAcks = acks.slice(0, 3);
    expect(pumpAcks.filter((a) => a.ok)).toHaveLength(2);
    expect(pumpAcks.filter((a) => !a.ok)).toEqual([expect.objectContaining({ reason: "pump-bus-limit" })]);
    expect(acks.slice(3).every((a) => a.ok)).toBe(true);
    const v = await hidden(server.url, eng.code);
    expect(v.flood.pumps.filter(Boolean)).toHaveLength(2);
    expect(v.flood.valves).toEqual({ FORE: true, CARGO: true, ENGINE: true });
    const n = await nav.waitFor((x) => (x as NavigatorView).flood.pumps.filter((p) => p.on).length === 2);
    expect((n as NavigatorView).flood.pumps.filter((p) => p.on)).toHaveLength(2);
  });

  it("a single player's burst of breaker closes cannot exceed the rules", async () => {
    const [eng] = await inPower();
    const cfg = (await hidden(server.url, eng.code)).config;
    // close every breaker at once: the shorted one (or overload) trips them all
    const acks = await Promise.all(Array.from({ length: 6 }, (_, index) => eng.send({ t: "setBreaker", index, closed: true })));
    for (const a of acks) if (!a.ok) expect(a.reason).toBe("generator-tripped");
    const v = await hidden(server.url, eng.code);
    expect(v.phase).toBe("POWER");
    expect(v.power.online).toBe(false);
    expect(v.mistakes).toBeGreaterThanOrEqual(1);
    // whatever stayed closed (after the trip) is never the shorted breaker
    expect(v.power.closed[cfg.power.shorted]).toBe(false);
  });
});

describe("intents are idempotent set-operations, not toggles", () => {
  it("opening a valve twice leaves it open", async () => {
    const [eng, nav] = track(await launch(server.url));
    await jump(server.url, [eng, nav], { phase: "FLOOD" });
    expect((await eng.send({ t: "setValve", compartment: "CARGO", open: true })).ok).toBe(true);
    expect((await eng.send({ t: "setValve", compartment: "CARGO", open: true })).ok).toBe(true);
    const e = await eng.waitFor((v) => (v as EngineerView).flood.valves.CARGO.open);
    expect((e as EngineerView).flood.valves.CARGO.open).toBe(true);
    expect((await hidden(server.url, eng.code)).flood.valves.CARGO).toBe(true);
    // and duplicate concurrent sends agree too
    await Promise.all([1, 2, 3, 4].map(() => eng.send({ t: "setValve", compartment: "FORE", open: true })));
    expect((await hidden(server.url, eng.code)).flood.valves.FORE).toBe(true);
  });

  it("pressing the prologue lever twice is harmless", async () => {
    const [eng, nav] = track(await launch(server.url));
    expect((await eng.send({ t: "prologueBreaker" })).ok).toBe(true);
    expect((await eng.send({ t: "prologueBreaker" })).ok).toBe(true);
    await nav.waitFor((v) => v.prologue.busOn);
    expect((await hidden(server.url, eng.code)).prologue.busOn).toBe(true);
  });
});
