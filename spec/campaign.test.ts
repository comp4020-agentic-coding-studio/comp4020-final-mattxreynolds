// Promise: the second production cycle's persistent systems work end to end
// over the real socket protocol. Unlocks follow a crew through Sail Again
// and through a fresh create from the same browser. Practice runs are
// labelled and never unlock. The same ship can be replayed. An active Act IV
// voyage survives a hard restart with its ship systems intact. Every ended
// voyage has a server-rendered debrief built from its ordered event log.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EngineerView, NavigatorView } from "../shared/protocol.ts";
import { connectPlayer, events, hidden, jump, launch, post, survive, type Player } from "./helpers/client.ts";
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

/** Both seats follow a sail-again move and reconnect to the new voyage. */
async function sailAgain(eng: Player, nav: Player, sameShip = false): Promise<[Player, Player]> {
  const moved = new Promise<string>((resolve) => eng.socket.once("moved", (m: { code: string }) => resolve(m.code)));
  expect((await nav.send({ t: "sailAgain", sameShip })).ok).toBe(true);
  const code = await moved;
  const next: [Player, Player] = [await connectPlayer(server.url, { ...eng, code }), await connectPlayer(server.url, { ...nav, code })];
  return track(next);
}

describe("unlocks follow the crew", () => {
  it("a fresh crew has only Standard and the full voyage", async () => {
    const [eng] = track(await launch(server.url));
    const a = await post(server.url, "/api/voyages", { callsign: "NEW" });
    const p = track([await connectPlayer(server.url, a.json)])[0];
    expect(p.view!.lobby).toMatchObject({ mode: "STANDARD", practice: null, unlockedModes: ["STANDARD"], unlockedActs: 1 });
    expect(await p.send({ t: "setMode", mode: "BLACKOUT" })).toMatchObject({ ok: false, reason: "locked" });
    expect(await p.send({ t: "setStart", act: 2 })).toMatchObject({ ok: false, reason: "locked" });
    expect(eng.view!.lobby).toBeNull();
  });

  it("surviving Standard unlocks the challenge modes and every act, for the same crew only", async () => {
    const [eng, nav] = track(await launch(server.url, ["UNA", "VIK"]));
    await survive(server.url, eng, nav);
    const [e2, n2] = await sailAgain(eng, nav);
    expect(e2.view!.lobby!.unlockedModes).toEqual(["STANDARD", "ROUGH_SEAS", "BLACKOUT", "RAPID_FLOOD", "CHAIN_REACTION"]);
    expect(n2.view!.lobby!.unlockedActs).toBe(5);
    // a new create carrying a seat token from that crew inherits the unlocks
    const fresh = await post(server.url, "/api/voyages", { callsign: "UNA", from: { code: e2.code, token: e2.token } });
    const p = track([await connectPlayer(server.url, fresh.json)])[0];
    expect(p.view!.lobby!.unlockedModes).toContain("BLACKOUT");
    // a forged token for that voyage does not
    const forged = await post(server.url, "/api/voyages", { callsign: "EVE", from: { code: e2.code, token: "x".repeat(43) } });
    const q = track([await connectPlayer(server.url, forged.json)])[0];
    expect(q.view!.lobby!.unlockedModes).toEqual(["STANDARD"]);
    // choosing a mode is shared by both seats and un-readies both
    await e2.send({ t: "setReady", ready: true });
    expect((await n2.send({ t: "setMode", mode: "RAPID_FLOOD" })).ok).toBe(true);
    const v = await e2.waitFor((x) => x.lobby?.mode === "RAPID_FLOOD");
    expect(v.crew.every((c) => !c.ready)).toBe(true);
  });

  it("surviving two challenge modes unlocks All Systems", async () => {
    let [eng, nav] = track(await launch(server.url, ["WYN", "XAN"]));
    await survive(server.url, eng, nav);
    for (const mode of ["ROUGH_SEAS", "BLACKOUT"] as const) {
      [eng, nav] = await sailAgain(eng, nav);
      expect((await eng.send({ t: "setMode", mode })).ok).toBe(true);
      await eng.send({ t: "setReady", ready: true });
      await nav.send({ t: "setReady", ready: true });
      await eng.waitFor((v) => v.phase === "PROLOGUE");
      expect(eng.view!.mode).toBe(mode);
      await survive(server.url, eng, nav);
    }
    [eng, nav] = await sailAgain(eng, nav);
    expect(eng.view!.lobby!.unlockedModes).toContain("NIGHTMARE");
  });
});

describe("practice", () => {
  it("starts at the chosen act, is labelled everywhere and never unlocks anything", async () => {
    const [eng, nav] = track(await launch(server.url, ["YUL", "ZED"]));
    // reach Act III on a full voyage (lost there)
    await jump(server.url, [eng, nav], { phase: "RADIO", deepestPhase: "RADIO", danger: 99.95 });
    await eng.waitFor((v) => v.phase === "LOST", 8000);
    const [e2, n2] = await sailAgain(eng, nav);
    expect(e2.view!.lobby!.unlockedActs).toBe(3);
    expect(e2.view!.lobby!.unlockedModes).toEqual(["STANDARD"]);
    expect(await e2.send({ t: "setStart", act: 4 })).toMatchObject({ ok: false, reason: "locked" });
    expect((await n2.send({ t: "setStart", act: 3 })).ok).toBe(true);
    await e2.send({ t: "setReady", ready: true });
    await n2.send({ t: "setReady", ready: true });
    const v = await e2.waitFor((x) => x.phase === "RADIO");
    expect(v.practice).toBe(3);
    expect(v.prologue.busOn).toBe(true);
    // win the practice: still no unlocks
    await survive(server.url, e2, n2);
    const log = await (await fetch(new URL("/history/", server.url))).text();
    expect(log).toContain(`VOYAGE ${e2.code}`);
    expect(log).toMatch(new RegExp(`VOYAGE ${e2.code}</b> <span class="pill practice">PRACTICE`));
    const [e3] = await sailAgain(e2, n2);
    expect(e3.view!.lobby!.unlockedModes).toEqual(["STANDARD"]);
    expect(e3.view!.practice).toBe(3); // sail again keeps the chosen start
  });
});

describe("replaying a ship", () => {
  it("'same ship' keeps the seed; a normal sail-again changes it; ?ship= on create picks one", async () => {
    const [eng, nav] = track(await launch(server.url, ["AB", "CD"]));
    const seed = (await hidden(server.url, eng.code)).seed;
    await survive(server.url, eng, nav);
    const [e2, n2] = await sailAgain(eng, nav, true);
    expect((await hidden(server.url, e2.code)).seed).toBe(seed);
    await jump(server.url, [e2, n2], { phase: "RADIO", deepestPhase: "RADIO", danger: 99.95 });
    await e2.waitFor((v) => v.phase === "LOST", 8000);
    const [e3] = await sailAgain(e2, n2);
    expect((await hidden(server.url, e3.code)).seed).not.toBe(seed);
    const picked = await post(server.url, "/api/voyages", { callsign: "EF", ship: 4242 });
    expect((await hidden(server.url, picked.json.code)).seed).toBe(4242);
    const bad = await post(server.url, "/api/voyages", { callsign: "EF", ship: -1 });
    expect((await hidden(server.url, bad.json.code)).seed).not.toBe(-1);
  });
});

describe("the debrief", () => {
  it("is persisted with the voyage and server-rendered at /log/CODE/, linked from the Ship's Log", async () => {
    const [eng, nav] = track(await launch(server.url, ["GH", "IJ"]));
    await eng.send({ t: "prologueBreaker" });
    await nav.waitFor((v) => v.prologue.busOn);
    await nav.send({ t: "prologueAck" });
    await eng.waitFor((v) => v.phase === "POWER");
    await survive(server.url, eng, nav);
    const end = await eng.waitFor((v) => v.outcome?.debrief != null);
    const d = end.outcome!.debrief!;
    expect(d.result).toBe("SURVIVED");
    expect(d.events.map((e) => e.k)).toEqual(expect.arrayContaining(["act", "busOn", "ack", "survived"]));
    const html = await (await fetch(new URL(`/log/${eng.code}/`, server.url))).text();
    expect(html).toContain(`Debrief — voyage ${eng.code}`);
    expect(html).toContain("Emergency bus restored");
    expect(html).toContain("<svg");
    expect(html).not.toContain(eng.token);
    expect(await (await fetch(new URL("/history/", server.url))).text()).toContain(`/log/${eng.code}/`);
    expect((await fetch(new URL("/log/ZZZZ/", server.url))).status).toBe(404);
    // the ordered event table mirrors the voyage's log with sequence numbers
    const ev = (await events(server.url, eng.code));
    const seqs = ev.filter((e) => e.kind.startsWith("log.")).map((e) => e.seq!);
    expect(seqs.length).toBeGreaterThan(3);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });
});

describe("an active Act IV voyage survives a hard restart", () => {
  it("phase, ship systems, roles and the event log resume coherently after SIGKILL", async () => {
    const [eng, nav] = track(await launch(server.url, ["KL", "MN"]));
    await jump(server.url, [eng, nav], {
      phase: "CASCADE",
      deepestPhase: "CASCADE",
      flood: { stable: true },
      ship: { cascadeAtMs: 0, evac: 40, circuits: { EVAC: true, LIGHTS: false }, powerTrips: 1 },
      power: { online: true },
    });
    expect((await nav.send({ t: "setCircuit", circuit: "RADIO", on: false })).ok).toBe(true);
    await nav.waitFor((v) => !v.ship.circuits.RADIO);
    const before = (await hidden(server.url, eng.code)) as { ship: { evac: number }; seq: number };
    await new Promise((r) => setTimeout(r, 2300)); // let the periodic persist land
    await server.kill();
    await server.restart();
    const [e2, n2] = track([await connectPlayer(server.url, eng), await connectPlayer(server.url, nav)]);
    const ev = e2.view as EngineerView;
    const nv = n2.view as NavigatorView;
    expect(ev.you).toBe("ENGINEER");
    expect(nv.you).toBe("NAVIGATOR");
    expect(ev.phase).toBe("CASCADE");
    expect(nv.ship.circuits).toEqual({ LIGHTS: false, RADIO: false, EVAC: true });
    expect(ev.grid.wear).toBe(1);
    const after = (await hidden(server.url, eng.code)) as { ship: { evac: number }; seq: number };
    expect(after.ship.evac).toBeGreaterThanOrEqual(before.ship.evac - 0.01);
    expect(after.seq).toBeGreaterThanOrEqual(before.seq);
    // and it keeps playing: the accumulator charges again
    const charge = after.ship.evac;
    await n2.waitFor((v) => v.ship.evac > charge + 1, 6000);
    // new events continue the sequence rather than restarting it
    expect((await n2.send({ t: "setCircuit", circuit: "RADIO", on: true })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const ev2 = (await events(server.url, eng.code));
    const seqs = ev2.filter((e) => e.seq !== null).map((e) => e.seq!);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
