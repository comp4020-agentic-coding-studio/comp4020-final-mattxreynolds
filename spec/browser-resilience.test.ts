// Promise: the game holds up on real networks. A slow link still creates,
// joins, readies and delivers a cross-room effect quickly; a player who drops
// offline is shown to their partner as "lost connection" and comes back with
// the same role and phase without a reload; a normal session logs no errors.
// Two independent browser contexts (two profiles), against the main app.
// Restricted to the lobby and prologue (the only rooms with live controls).

import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { closeBrowser, createViaUi, joinViaLink, profile, slowLink, use, viewOf, waitView, type Profile } from "./helpers/browser.ts";

const baseUrl = inject("baseUrl");
let profiles: Profile[] = [];
afterEach(async () => {
  for (const p of profiles) await p.context.close().catch(() => {});
  profiles = [];
});
afterAll(async () => {
  await closeBrowser();
});

async function pair(): Promise<[Profile, Profile]> {
  const a = await profile(baseUrl);
  const b = await profile(baseUrl);
  profiles.push(a, b);
  return [a, b];
}

/** Lobby → both ready → both in PROLOGUE with the briefing card up. */
async function toPrologue(a: Profile, b: Profile): Promise<string> {
  const code = await createViaUi(a, "Ada");
  await joinViaLink(b, code, "Lin");
  await a.page.locator('[data-role="NAVIGATOR"] .callsign', { hasText: "LIN" }).waitFor();
  await a.page.getByTestId("ready").click();
  await b.page.locator('[data-role="ENGINEER"] .ready.yes').waitFor();
  await b.page.getByTestId("ready").click();
  await waitView(a.page, "v.phase === 'PROLOGUE'");
  await waitView(b.page, "v.phase === 'PROLOGUE'");
  return code;
}

describe("a slow connection still plays", () => {
  it("~400 ms latency on the Navigator: create/join/ready work and the lever reaches the Bridge within 2 s", async () => {
    const [a, b] = await pair();
    await slowLink(b, 400);

    await toPrologue(a, b);
    const t0 = Date.now();
    await use(a.page, "prologue-lever");
    await waitView(b.page, "v.prologue.busOn === true", 2000);
    const leverMs = Date.now() - t0;
    expect(leverMs).toBeLessThan(2000);
    // the link really is slow (server → Navigator is half the RTT), so this
    // test can't silently degrade into a fast-path check
    expect(leverMs).toBeGreaterThanOrEqual(150);

    // and the slow side's action reaches the fast side too
    const t1 = Date.now();
    await use(b.page, "prologue-ack");
    await waitView(a.page, "v.phase === 'POWER'", 2500);
    expect(Date.now() - t1).toBeLessThan(2500);

    expect(a.errors, a.errors.join("\n")).toEqual([]);
    expect(b.errors, b.errors.join("\n")).toEqual([]);
  });
});

describe("going offline and back restores the seat without a reload", () => {
  it("the partner sees 'lost connection'; on return the Navigator has the same role and phase", async () => {
    const [a, b] = await pair();
    const code = await toPrologue(a, b);
    await use(a.page, "prologue-lever");
    await waitView(b.page, "v.prologue.busOn === true");

    const banner = a.page.getByRole("status").filter({ hasText: /lost connection/i });
    await b.context.setOffline(true);
    // the partner hears about it from the server, in their own room
    await banner.waitFor({ timeout: 8000 });
    await b.page.waitForTimeout(4000);
    await b.context.setOffline(false);

    // the Navigator is back on the same voyage, same role, same phase — no reload
    await waitView(
      b.page,
      `v.code === '${code}' && v.you === 'NAVIGATOR' && v.phase === 'PROLOGUE' && v.prologue.busOn === true && v.crew.every(c => c.connected)`,
      15000,
    );
    await banner.waitFor({ state: "detached", timeout: 8000 });
    expect(new URL(b.page.url()).pathname).toBe(`/v/${code}`);
    // and play continues across the gap
    await use(b.page, "prologue-ack");
    await waitView(a.page, "v.phase === 'POWER'", 2000);
    expect((await viewOf(a.page)).paused).toBe(false);

    // only network failures caused by going offline are acceptable here
    const unexpected = (p: Profile) => p.errors.filter((e) => !/websocket|net::ERR_INTERNET_DISCONNECTED|Failed to load resource|ERR_NETWORK/i.test(e));
    expect(unexpected(a), a.errors.join("\n")).toEqual([]);
    expect(unexpected(b), b.errors.join("\n")).toEqual([]);
  });
});

describe("a normal session is error-free", () => {
  it("no page errors or console errors from home to POWER", async () => {
    const [a, b] = await pair();
    await toPrologue(a, b);
    await use(a.page, "prologue-lever");
    await waitView(b.page, "v.prologue.busOn === true");
    await use(b.page, "prologue-ack");
    await waitView(a.page, "v.phase === 'POWER'");
    await waitView(b.page, "v.phase === 'POWER'");
    // the Ship's Log and README open cleanly too
    await a.page.goto("/history/");
    await a.page.getByRole("heading", { name: "Ship's Log" }).waitFor();
    await b.page.goto("/readme/");
    await b.page.getByRole("link", { name: /Play Below the Waterline/ }).waitFor();
    expect(a.errors, a.errors.join("\n")).toEqual([]);
    expect(b.errors, b.errors.join("\n")).toEqual([]);
  });
});
