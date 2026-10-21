// Promise: presence is per seat, and losing a partner is fair. A partner who
// drops for > 3 s pauses the voyage (no water comes in, no controls work)
// until they return; a lobby drop clears ready; two tabs of one profile are
// one player; a voyage never starts or seats a stranger once both seats are
// taken. Runs against the main app (no test hooks needed).

import { afterEach, describe, expect, inject, it } from "vitest";
import { DISCONNECT_PAUSE_MS } from "../shared/config.ts";
import type { View } from "../shared/protocol.ts";
import { connectPlayer, crew, launch, post, throughPrologue, type Player } from "./helpers/client.ts";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const seat = (v: View, role: string) => v.crew.find((c) => c.role === role)!;

describe("a partner's disconnect pauses the voyage until they return", () => {
  it("pauses after ~3 s, holds danger and controls, resumes on reconnect", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    await throughPrologue(eng, nav); // POWER: danger rises on its own
    await eng.waitFor((v) => v.danger > 10); // the clock is really running

    const droppedAt = Date.now();
    nav.close();
    await eng.waitFor((v) => !seat(v, "NAVIGATOR").connected, 2000);
    // not instantly: a brief blip doesn't stop the ship
    expect(eng.view!.paused).toBe(false);
    const paused = await eng.waitFor((v) => v.paused, DISCONNECT_PAUSE_MS + 3000);
    expect(Date.now() - droppedAt).toBeGreaterThanOrEqual(DISCONNECT_PAUSE_MS - 250);

    // controls are held while paused
    expect(await eng.send({ t: "setBreaker", index: 0, closed: true })).toMatchObject({ ok: false, reason: "paused" });

    // and the water does not rise: wait, then compare what the Engineer sees
    // after the Navigator returns with what it saw at the pause
    const gapStart = Date.now();
    await sleep(2500);
    const back = track([await connectPlayer(baseUrl, nav)])[0];
    expect(back.view!.you).toBe("NAVIGATOR");
    expect(back.view!.phase).toBe("POWER");
    const resumed = await eng.waitFor((v) => !v.paused && seat(v, "NAVIGATOR").connected, 3000);
    await back.waitFor((v) => !v.paused);
    const gapMs = Date.now() - gapStart;
    // play time froze for the whole gap (it would have advanced gapMs), and so
    // did the water (0.08/s in POWER; views round danger to 0.1)
    expect(gapMs).toBeGreaterThanOrEqual(2500);
    expect(resumed.elapsedMs - paused.elapsedMs).toBeLessThan(500);
    expect(resumed.danger - paused.danger).toBeLessThanOrEqual(0.1 + 1e-9);

    // controls work again
    expect((await eng.send({ t: "setBreaker", index: 0, closed: false })).ok).toBe(true);
  });

  it("the waiting player sees the paused flag; the voyage keeps running after a short blip", async () => {
    const [eng, nav] = track(await launch(baseUrl));
    nav.close();
    await eng.waitFor((v) => !seat(v, "NAVIGATOR").connected, 2000);
    track([await connectPlayer(baseUrl, nav)]);
    await eng.waitFor((v) => seat(v, "NAVIGATOR").connected, 2000);
    // a reconnect inside the threshold never pauses
    await sleep(DISCONNECT_PAUSE_MS + 500);
    expect(eng.view!.paused).toBe(false);
  });
});

describe("a lobby disconnect clears that player's ready flag", () => {
  it("ready → drop → not ready, and still not ready on return", async () => {
    const [eng, nav] = track(await crew(baseUrl));
    await eng.send({ t: "setReady", ready: true });
    await nav.waitFor((v) => seat(v, "ENGINEER").ready);
    eng.close();
    const v = await nav.waitFor((x) => !seat(x, "ENGINEER").connected);
    expect(seat(v, "ENGINEER").ready).toBe(false);
    const again = track([await connectPlayer(baseUrl, eng)])[0];
    expect(seat(again.view!, "ENGINEER").ready).toBe(false);
    // so the Navigator readying alone does not start the voyage
    await nav.send({ t: "setReady", ready: true });
    await again.waitFor((x) => seat(x, "NAVIGATOR").ready);
    expect(again.view!.phase).toBe("LOBBY");
  });
});

describe("two tabs of one profile are one player", () => {
  it("both tabs get views; closing one does not disconnect the seat", async () => {
    const [tab1, nav] = track(await crew(baseUrl));
    const tab2 = track([await connectPlayer(baseUrl, tab1)])[0];
    expect(tab2.view!.you).toBe("ENGINEER");

    await nav.send({ t: "setReady", ready: true });
    await tab1.waitFor((v) => seat(v, "NAVIGATOR").ready);
    await tab2.waitFor((v) => seat(v, "NAVIGATOR").ready);

    tab1.close();
    // force a fresh broadcast, then check the seat is still present
    await nav.send({ t: "setReady", ready: false });
    const n = await nav.waitFor((v) => !seat(v, "NAVIGATOR").ready);
    expect(seat(n, "ENGINEER").connected).toBe(true);
    await tab2.waitFor((v) => !seat(v, "NAVIGATOR").ready);

    // and the remaining tab can still act for the seat
    expect((await tab2.send({ t: "setReady", ready: true })).ok).toBe(true);
    await nav.waitFor((v) => seat(v, "ENGINEER").ready);
  });

  it("in play, one closed tab never pauses the voyage", async () => {
    const [tab1, nav] = track(await launch(baseUrl));
    const tab2 = track([await connectPlayer(baseUrl, tab1)])[0];
    tab1.close();
    await sleep(DISCONNECT_PAUSE_MS + 500);
    const v = await nav.waitFor((x) => x.rev > 0);
    expect(v.paused).toBe(false);
    expect(seat(v, "ENGINEER").connected).toBe(true);
    // tab2 is live: its lever pull reaches the Bridge
    await tab2.send({ t: "prologueBreaker" });
    await nav.waitFor((x) => x.prologue.busOn, 1000);
  });
});

describe("seats are fixed once filled", () => {
  it("a joiner arriving after the voyage started is refused 409 full", async () => {
    const [eng] = track(await launch(baseUrl));
    const late = await post(baseUrl, `/api/voyages/${eng.code}/join`, { callsign: "LATE" });
    expect(late.status).toBe(409);
    expect(late.json).toEqual({ error: "full" });
    expect(JSON.stringify(late.json)).not.toMatch(/token/);
  });

  it("a voyage with only one seat filled cannot start", async () => {
    const a = await post(baseUrl, "/api/voyages", { callsign: "SOLO" });
    const eng = track([await connectPlayer(baseUrl, a.json)])[0];
    expect((await eng.send({ t: "setReady", ready: true })).ok).toBe(true);
    const v = await eng.waitFor((x) => seat(x, "ENGINEER").ready);
    expect(v.phase).toBe("LOBBY");
    expect(v.crew).toHaveLength(1);
    // nothing in play works either
    expect(await eng.send({ t: "prologueBreaker" })).toMatchObject({ ok: false, reason: "wrong-phase" });
    const peek = await (await fetch(new URL(`/api/voyages/${a.json.code}`, baseUrl))).json();
    expect(peek.phase).toBe("LOBBY");
  });
});
