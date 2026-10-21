// Multi-user promises at the socket level: distinct identities, two seats,
// server-assigned roles, ready/start, real-time propagation, reconnect.

import { afterEach, describe, expect, inject, it } from "vitest";
import { connectPlayer, crew, launch, post, type Player } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
let open: Player[] = [];
afterEach(() => {
  open.forEach((p) => p.close());
  open = [];
});
const track = <T extends Player[]>(ps: T): T => {
  open.push(...ps);
  return ps;
};

describe("voyage seats", () => {
  it("creator is Engineer, joiner is Navigator, with distinct secret tokens", async () => {
    const a = await post(baseUrl, "/api/voyages", { callsign: "ada" });
    expect(a.status).toBe(201);
    expect(a.json.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(a.json.role).toBe("ENGINEER");
    const b = await post(baseUrl, `/api/voyages/${a.json.code.toLowerCase()}/join`, { callsign: "lin" });
    expect(b.status).toBe(201);
    expect(b.json.role).toBe("NAVIGATOR");
    expect(b.json.token).not.toBe(a.json.token);
  });

  it("admits at most two players: a third is refused with 409 full", async () => {
    const a = await post(baseUrl, "/api/voyages", { callsign: "ada" });
    await post(baseUrl, `/api/voyages/${a.json.code}/join`, { callsign: "lin" });
    const c = await post(baseUrl, `/api/voyages/${a.json.code}/join`, { callsign: "eve" });
    expect(c.status).toBe(409);
    expect(c.json).toEqual({ error: "full" });
  });

  it("rejects unknown codes and bad callsigns", async () => {
    expect((await post(baseUrl, "/api/voyages/ZZZZ/join", { callsign: "x" })).status).toBe(404);
    expect((await post(baseUrl, "/api/voyages", { callsign: "" })).status).toBe(400);
    expect((await post(baseUrl, "/api/voyages", { callsign: "<script>" })).status).toBe(400);
    expect((await post(baseUrl, "/api/voyages", { callsign: "A".repeat(13) })).status).toBe(400);
  });

  it("a forged token gets no view", async () => {
    const a = await post(baseUrl, "/api/voyages", { callsign: "ada" });
    await expect(connectPlayer(baseUrl, { ...a.json, token: "forged" })).rejects.toThrow(/bad-token/);
  });

  it("views never contain any seat token", async () => {
    const [eng, nav] = track(await crew(baseUrl));
    const both = JSON.stringify([eng.view, nav.view]);
    expect(both).not.toContain(eng.token);
    expect(both).not.toContain(nav.token);
  });
});

describe("ready and start", () => {
  it("does not start until both are ready, then both see PROLOGUE", async () => {
    const [eng, nav] = track(await crew(baseUrl));
    await eng.send({ t: "setReady", ready: true });
    await nav.waitFor((v) => v.crew.find((c) => c.role === "ENGINEER")!.ready);
    expect(eng.view!.phase).toBe("LOBBY");
    await nav.send({ t: "setReady", ready: true });
    await eng.waitFor((v) => v.phase === "PROLOGUE");
    await nav.waitFor((v) => v.phase === "PROLOGUE");
  });

  it("each player is told their own role", async () => {
    const [eng, nav] = track(await crew(baseUrl));
    expect(eng.view!.you).toBe("ENGINEER");
    expect(nav.view!.you).toBe("NAVIGATOR");
  });
});

describe("real-time cross-room causality", () => {
  it("the Engineer's breaker powers the Bridge consoles within a second", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    const t0 = Date.now();
    expect((await eng.send({ t: "prologueBreaker" })).ok).toBe(true);
    await nav.waitFor((v) => v.prologue.busOn, 1000);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("the Navigator's acknowledge is refused while consoles are dead, then reaches the Engineer", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    expect(await nav.send({ t: "prologueAck" })).toMatchObject({ ok: false, reason: "consoles-dead" });
    await eng.send({ t: "prologueBreaker" });
    await nav.waitFor((v) => v.prologue.busOn);
    expect((await nav.send({ t: "prologueAck" })).ok).toBe(true);
    await eng.waitFor((v) => v.phase === "POWER", 1000);
  });

  it("a player cannot use the other role's control", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    expect(await nav.send({ t: "prologueBreaker" })).toMatchObject({ ok: false, reason: "wrong-role" });
    expect(await eng.send({ t: "prologueAck" })).toMatchObject({ ok: false, reason: "wrong-role" });
  });
});

describe("reconnect", () => {
  it("a new socket with the same token gets the same role and current state", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    await eng.send({ t: "prologueBreaker" });
    await nav.waitFor((v) => v.prologue.busOn);
    nav.close();
    const again = track([await connectPlayer(baseUrl, nav)])[0];
    expect(again.view!.you).toBe("NAVIGATOR");
    expect(again.view!.phase).toBe("PROLOGUE");
    expect(again.view!.prologue.busOn).toBe(true);
  });

  it("the partner sees a disconnect and the return", async () => {
    const [eng, nav] = track(await crew(baseUrl));
    nav.close();
    await eng.waitFor((v) => v.crew.find((c) => c.role === "NAVIGATOR")!.connected === false);
    track([await connectPlayer(baseUrl, nav)]);
    await eng.waitFor((v) => v.crew.find((c) => c.role === "NAVIGATOR")!.connected === true);
  });
});
