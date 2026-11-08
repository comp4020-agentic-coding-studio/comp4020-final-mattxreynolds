// Promise: a voyage survives the server going away. Canonical state is in
// SQLite (voyages.state_json), written after every applied intent, flushed on
// SIGTERM, and reloaded on boot; seats are restored from the same tokens; the
// Ship's Log is server-rendered from the DB and never shows a token.
//
// Runs its own server (test hooks on) so it can stop and restart it on the
// same database file.

import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EngineerView, NavigatorView } from "../shared/protocol.ts";
import { connectPlayer, hidden, jump, launch, survive, throughPrologue, type Player } from "./helpers/client.ts";
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

/** Launches a voyage into POWER and closes one breaker that is part of the
 * solution (so never the shorted one, and never enough to finish POWER). */
async function voyageInPower(): Promise<{ eng: Player; nav: Player; index: number }> {
  const [eng, nav] = track(await launch(server.url));
  await throughPrologue(eng, nav);
  const cfg = (await hidden(server.url, eng.code)).config;
  const index: number = cfg.power.solution[0];
  expect(index).not.toBe(cfg.power.shorted);
  expect((await eng.send({ t: "setBreaker", index, closed: true })).ok).toBe(true);
  await eng.waitFor((v) => (v as EngineerView).power.breakers[index].closed);
  return { eng, nav, index };
}

async function reconnectBoth(eng: Player, nav: Player): Promise<[Player, Player]> {
  const both: [Player, Player] = [await connectPlayer(server.url, eng), await connectPlayer(server.url, nav)];
  return track(both);
}

describe("canonical voyage state survives a graceful restart (SIGTERM)", () => {
  it("same seats, roles, code, phase and puzzle state; downtime is not play time", async () => {
    const { eng, nav, index } = await voyageInPower();
    const before = eng.view as EngineerView;
    const crewBefore = before.crew.map((c) => [c.role, c.callsign]);

    await server.stop("SIGTERM");
    const downAt = Date.now();
    await sleep(3000); // a real outage: long enough that, if counted, it would show
    await server.restart();
    const downMs = Date.now() - downAt;

    const [eng2, nav2] = await reconnectBoth(eng, nav);
    const e = eng2.view as EngineerView;
    const n = nav2.view as NavigatorView;
    expect(e.you).toBe("ENGINEER");
    expect(n.you).toBe("NAVIGATOR");
    expect(e.code).toBe(eng.code);
    expect(n.code).toBe(eng.code);
    expect(e.phase).toBe("POWER");
    expect(n.phase).toBe("POWER");
    expect(e.crew.map((c) => [c.role, c.callsign])).toEqual(crewBefore);
    expect(e.power.breakers[index].closed).toBe(true);
    expect(e.power.breakers.filter((b) => b.closed)).toHaveLength(1);
    expect(Math.abs(e.danger - before.danger)).toBeLessThan(2);
    // elapsed play time moved by well under the outage
    expect(e.elapsedMs).toBeGreaterThanOrEqual(before.elapsedMs);
    expect(e.elapsedMs - before.elapsedMs).toBeLessThan(Math.min(2000, downMs));
  });
});

describe("an applied intent is persisted immediately (SIGKILL, no flush)", () => {
  it("the last acknowledged intent is still there after a crash", async () => {
    const { eng, nav, index } = await voyageInPower();
    const cfg = (await hidden(server.url, eng.code)).config;
    const second: number = cfg.power.solution[1];
    // open the first, close the second: the final state differs from any
    // earlier periodic save, and we kill straight after the ack
    expect((await eng.send({ t: "setBreaker", index, closed: false })).ok).toBe(true);
    expect((await eng.send({ t: "setBreaker", index: second, closed: true })).ok).toBe(true);
    await server.kill();
    await server.restart();

    const [eng2] = await reconnectBoth(eng, nav);
    const e = eng2.view as EngineerView;
    expect(e.phase).toBe("POWER");
    expect(e.power.breakers[index].closed).toBe(false);
    expect(e.power.breakers[second].closed).toBe(true);
  });
});

type HistoryApi = {
  voyages: {
    code: string;
    status: string;
    outcome: string | null;
    failure_cause: string | null;
    deepest_phase: string;
    duration_ms: number | null;
    engineer: string | null;
    navigator: string | null;
  }[];
  stats: { total: number };
};

async function historyBoth(): Promise<{ html: string; api: HistoryApi }> {
  const page = await fetch(new URL("/history/", server.url));
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toMatch(/text\/html/);
  const api = await fetch(new URL("/api/history", server.url));
  expect(api.status).toBe(200);
  return { html: await page.text(), api: (await api.json()) as HistoryApi };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function expectNoSecrets(text: string, players: Player[]): void {
  for (const p of players) {
    expect(text).not.toContain(p.token);
    expect(text).not.toContain(sha256(p.token));
  }
  expect(text).not.toMatch(/token/i);
}

describe("the Ship's Log keeps finished voyages across a restart", () => {
  it("a SURVIVED voyage is listed with outcome, crew and duration, and no token", async () => {
    const [eng, nav] = track(await launch(server.url, ["MARGO", "TEDDY"]));
    await survive(server.url, eng, nav);
    const durationMs = eng.view!.outcome!.durationMs;
    await server.restart();

    const { html, api } = await historyBoth();
    const row = api.voyages.find((r) => r.code === eng.code);
    expect(row).toMatchObject({
      status: "ENDED",
      outcome: "SURVIVED",
      engineer: "MARGO",
      navigator: "TEDDY",
      duration_ms: durationMs,
    });
    const tr = html.match(new RegExp(`<tr data-code="${eng.code}">([\\s\\S]*?)</tr>`))?.[1];
    expect(tr, "voyage row missing from /history/").toBeTruthy();
    expect(tr).toContain("SURVIVED");
    expect(tr).toContain("MARGO");
    expect(tr).toContain("TEDDY");
    const s = Math.round(durationMs / 1000);
    expect(tr).toContain(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    expectNoSecrets(html, [eng, nav]);
    expectNoSecrets(JSON.stringify(api), [eng, nav]);
  });

  it("a LOST voyage records the failure cause and the phase reached", async () => {
    const [eng, nav] = track(await launch(server.url, ["RHEA", "OTTO"]));
    // danger rises 0.1/s in RADIO, so the ship goes down ~1 s later on its own
    await jump(server.url, [eng, nav], { phase: "RADIO", deepestPhase: "RADIO", danger: 99.9 });
    const lost = await eng.waitFor((v) => v.phase === "LOST", 8000);
    expect(lost.outcome).toMatchObject({
      result: "LOST",
      failureCause: "No distress call reached shore",
      phaseReached: "RADIO",
    });
    await nav.waitFor((v) => v.phase === "LOST");
    await server.restart();

    const { html, api } = await historyBoth();
    const row = api.voyages.find((r) => r.code === eng.code);
    expect(row).toMatchObject({
      status: "ENDED",
      outcome: "LOST",
      failure_cause: "No distress call reached shore",
      deepest_phase: "RADIO",
      engineer: "RHEA",
      navigator: "OTTO",
    });
    const tr = html.match(new RegExp(`<tr data-code="${eng.code}">([\\s\\S]*?)</tr>`))?.[1];
    expect(tr).toContain("LOST");
    expect(tr).toContain("No distress call reached shore");
    expect(tr).toContain("Act III · Mayday"); // RADIO's display name
    expectNoSecrets(html, [eng, nav]);
  });
});
