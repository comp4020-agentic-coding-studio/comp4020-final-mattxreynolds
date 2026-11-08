// Dev mode (docs/DEV_MODE.md): one browser holds both seats and can skip
// acts. It must not exist in production, and its actions must go through the
// normal transitions (one phase at a time, logged, fired once).

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { connectPlayer, post, type Player } from "./helpers/client.ts";
import { startServer, type TestServer } from "./helpers/server.ts";

const baseUrl = inject("baseUrl");

describe("dev mode is absent by default in production", () => {
  it("the app under test has no /api/dev routes", async () => {
    expect(await (await fetch(new URL("/api/dev/status", baseUrl))).json()).toEqual({ dev: false });
    expect((await post(baseUrl, "/api/dev/voyages", {})).status).toBe(404);
  });
});

describe("dev mode when enabled", () => {
  let server: TestServer;
  const open: Player[] = [];
  beforeAll(async () => {
    server = await startServer({ env: { ENABLE_DEV_TOOLS: "1" } });
  });
  afterAll(async () => {
    open.forEach((p) => p.close());
    await server?.dispose();
  });

  it("creates a voyage with both seats, everything unlocked, and skips through every act to SURVIVED", async () => {
    const r = await post(server.url, "/api/dev/voyages", {});
    expect(r.status).toBe(201);
    const { code, seats } = r.json as { code: string; seats: { code: string; token: string; role: string }[] };
    expect(seats.map((s) => s.role).sort()).toEqual(["ENGINEER", "NAVIGATOR"]);
    const [eng, nav] = await Promise.all(seats.map((s) => connectPlayer(server.url, s)));
    open.push(eng, nav);
    expect(eng.view!.lobby!.unlockedActs).toBe(5);
    expect(eng.view!.lobby!.unlockedModes).toContain("NIGHTMARE");

    await eng.send({ t: "setReady", ready: true });
    await nav.send({ t: "setReady", ready: true });
    await eng.waitFor((v) => v.phase === "PROLOGUE");

    const action = (k: string, token = eng.token) => post(server.url, `/api/dev/voyages/${code}/action`, { token, action: { k } });
    const seen: string[] = [];
    for (const next of ["POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED"]) {
      expect((await action("skip")).status).toBe(200);
      const v = await nav.waitFor((x) => x.phase === next);
      seen.push(v.phase);
    }
    expect(seen).toEqual(["POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED"]);
    expect((await action("skip")).status).toBe(409);
  });

  it("refuses a forged token and a malformed action", async () => {
    const r = await post(server.url, "/api/dev/voyages", {});
    const code = r.json.code;
    expect((await post(server.url, `/api/dev/voyages/${code}/action`, { token: "forged", action: { k: "skip" } })).status).toBe(403);
    expect((await post(server.url, `/api/dev/voyages/${code}/action`, { token: r.json.seats[0].token, action: { k: "toString" } })).status).toBe(400);
  });

  it("refuses dev actions on a real (non-dev) voyage even with dev tools on", async () => {
    const a = await post(server.url, "/api/voyages", { callsign: "ADA" });
    const code = a.json.code as string;
    const r = await post(server.url, `/api/dev/voyages/${code}/action`, { token: a.json.token, action: { k: "skip" } });
    expect(r.status).toBe(409);
  });
});
