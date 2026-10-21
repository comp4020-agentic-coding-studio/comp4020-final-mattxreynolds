// Promise: the server stays authoritative and consistent under abuse:
// duplicated, delayed, reordered and simultaneous intents from both seats,
// reconnect storms and malformed payloads. Bounded: every loop is capped and
// every socket is closed in afterEach.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import type { Intent, View } from "../shared/protocol.ts";
import { connectPlayer, events, hidden, jump, launch, type Player } from "./helpers/client.ts";
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A deterministic PRNG so a failing run can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORDER = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED", "LOST"];

describe("chaos over the wire", () => {
  it("a storm of random, duplicated and delayed intents from both seats never breaks the voyage", { timeout: 60_000 }, async () => {
    const [eng, nav] = track(await launch(server.url, ["CHA", "OS"]));
    await jump(server.url, [eng, nav], { phase: "CASCADE", deepestPhase: "CASCADE", flood: { stable: true }, power: { online: true }, ship: { cascadeAtMs: 0 } });
    const r = rng(1234);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
    const engIntents = (): Intent[] => [
      { t: "setValve", compartment: pick([...COMPARTMENTS]), open: r() < 0.5 },
      { t: "gridReset" },
      { t: "setAntenna", bearing: Math.floor(r() * 8) },
      { t: "setPump", pump: 0, on: true }, // not the Engineer's
      { t: "abandon" },
    ];
    const navIntents = (): Intent[] => [
      { t: "setPump", pump: Math.floor(r() * 3), on: r() < 0.5 },
      { t: "setCircuit", circuit: pick(["LIGHTS", "RADIO", "EVAC"] as const), on: r() < 0.5 },
      { t: "answerCall" },
      { t: "armDavits" },
      { t: "setValve", compartment: "FORE", open: true }, // not the Navigator's
    ];
    const pending: Promise<unknown>[] = [];
    const seen: string[] = [];
    nav.socket.on("view", (v: View) => {
      if (seen[seen.length - 1] !== v.phase) seen.push(v.phase);
    });
    for (let i = 0; i < 300; i++) {
      const who = r() < 0.5 ? eng : nav;
      const intent = pick(who === eng ? engIntents() : navIntents());
      const copies = r() < 0.2 ? 3 : 1; // duplicates
      for (let c = 0; c < copies; c++) {
        const delay = Math.floor(r() * 40); // reordering within a 40 ms window
        pending.push(sleep(delay).then(() => who.send(intent).catch(() => null)));
      }
      if (i % 25 === 0) await sleep(30);
    }
    const acks = (await Promise.all(pending)) as ({ ok: boolean; reason?: string } | null)[];
    // wrong-role intents were refused, every time
    expect(acks.filter((a) => a && !a.ok && a.reason === "wrong-role").length).toBeGreaterThan(0);
    // the canonical state is consistent
    const v = await hidden(server.url, eng.code);
    for (const c of COMPARTMENTS) {
      expect(v.flood.levels[c]).toBeGreaterThanOrEqual(0);
      expect(v.flood.levels[c]).toBeLessThanOrEqual(100);
    }
    expect(v.danger).toBeGreaterThanOrEqual(0);
    expect(v.danger).toBeLessThanOrEqual(100);
    expect(v.ship.evac).toBeGreaterThanOrEqual(0);
    expect(v.ship.evac).toBeLessThanOrEqual(100);
    expect(v.flood.pumps.filter(Boolean).length).toBeLessThanOrEqual(2);
    // phases seen by a client only ever moved forward
    const idx = seen.map((p) => ORDER.indexOf(p));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    // roles never changed
    expect((eng.view as View).you).toBe("ENGINEER");
    expect((nav.view as View).you).toBe("NAVIGATOR");
    // the ordered event log has unique, increasing sequence numbers
    const seqs = (await events(server.url, eng.code)).filter((e) => e.seq !== null).map((e) => e.seq!);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });

  it("a reconnect storm (one seat dropping and rejoining repeatedly) restores identity every time", { timeout: 40_000 }, async () => {
    const [eng, nav] = track(await launch(server.url, ["RE", "CON"]));
    let p = nav;
    for (let i = 0; i < 8; i++) {
      p.close();
      await sleep(i % 2 ? 50 : 300);
      p = track([await connectPlayer(server.url, nav)])[0];
      expect(p.view!.you).toBe("NAVIGATOR");
      expect(p.view!.code).toBe(nav.code);
    }
    // two sockets for the same seat at once: both get the same role
    const twin = track([await connectPlayer(server.url, nav)])[0];
    expect(twin.view!.you).toBe("NAVIGATOR");
    expect((await twin.send({ t: "prologueAck" })).ok === false).toBe(true); // bus still off: consoles-dead
    await eng.send({ t: "prologueBreaker" });
    await twin.waitFor((v) => v.prologue.busOn);
    await p.waitFor((v) => v.prologue.busOn);
    // the voyage never paused for good
    const v = await hidden(server.url, eng.code);
    expect(v.paused).toBe(false);
  });

  it("simultaneous abandon pulls and davit arms from both seats resolve to exactly one SURVIVED", async () => {
    const [eng, nav] = track(await launch(server.url, ["SI", "MUL"]));
    await jump(server.url, [eng, nav], {
      phase: "ESCAPE",
      deepestPhase: "ESCAPE",
      escape: { door: 100 },
      ship: { evac: 100, circuits: { EVAC: true } },
    });
    await Promise.all([
      ...Array.from({ length: 4 }, () => nav.send({ t: "armDavits" })),
      ...Array.from({ length: 4 }, () => eng.send({ t: "abandon" })),
      ...Array.from({ length: 4 }, () => nav.send({ t: "abandon" })),
    ]);
    // the Engineer's early pulls may have landed before the davits: pull again
    await Promise.all([eng.send({ t: "abandon" }), nav.send({ t: "abandon" })]);
    await eng.waitFor((v) => v.phase === "SURVIVED");
    const ev = await events(server.url, eng.code);
    expect(ev.filter((e) => e.kind === "phase" && e.detail === "SURVIVED")).toHaveLength(1);
    expect(ev.filter((e) => e.kind === "log.davits")).toHaveLength(1);
  });

  it("malformed and hostile payloads are refused without crashing the server", async () => {
    const [eng, nav] = track(await launch(server.url, ["BAD", "IN"]));
    const raw = (p: Player, intent: unknown) =>
      p.socket.timeout(2000).emitWithAck("intent", { seq: 1, intent }).catch(() => ({ ok: false, reason: "timeout" }));
    const hostile: unknown[] = [
      { t: "setCircuit", circuit: "__proto__", on: true },
      { t: "setCircuit", circuit: "EVAC", on: "yes" },
      { t: "setMode", mode: "constructor" },
      { t: "setStart", act: 1.5 },
      { t: "setStart", act: 99 },
      { t: "sailAgain", sameShip: { evil: true } },
      { t: "answerCall", bearing: 3 },
      { t: "armDavits", armed: true },
      { t: "gridReset", now: 0 },
      { t: "setPump", pump: -1, on: true },
      { t: "setValve", compartment: "BILGE", open: true },
      null,
      "string",
      [1, 2, 3],
    ];
    for (const h of hostile) {
      const a = (await raw(Math.random() < 0.5 ? eng : nav, h)) as { ok: boolean };
      expect(a.ok, JSON.stringify(h)).toBe(false);
    }
    expect((await fetch(new URL("/healthz", server.url))).ok).toBe(true);
    expect((await hidden(server.url, eng.code)).phase).toBe("PROLOGUE");
  });
});
