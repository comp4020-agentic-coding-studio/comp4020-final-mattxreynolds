import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { boot, stop } from "./server.ts";

it("narrates distinct users, every input, conflicts, reconnects and committed outcomes without secrets", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-air-logs-"));
  const server = await boot(dir);
  const streams: AbortController[] = [];
  const request = async (route: string, id?: string, body?: unknown, method = body ? "POST" : "GET") => {
    const res = await fetch(server.base + route, { method,
      headers: { "content-type": "application/json", ...(id ? { "x-player": id } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { res, body: await res.json() };
  };
  const connect = async (code: string, id: string, role: string) => {
    const c = new AbortController(); streams.push(c);
    const res = await fetch(`${server.base}/api/rooms/${code}/stream?player=${id}&role=${role}`, { signal: c.signal });
    await res.body!.getReader().read(); return c;
  };
  try {
    const { body: a } = await request("/api/players", undefined, { callsign: "SAME-NAME" });
    const { body: b } = await request("/api/players", undefined, { callsign: "SAME-NAME" });
    const { body: { code } } = await request("/api/rooms", a.id, {});
    const op = await connect(code, a.id, "operator");
    const ex = await connect(code, b.id, "expert");
    const seen = { missionNo: 1, revision: 0 };
    const results = await Promise.all([a, b].map(p => request(`/api/rooms/${code}/actions`, p.id,
      { type: "flip", index: 0, ...seen })));
    expect(results.map(r => r.res.status).sort()).toEqual([200, 409]);
    await request(`/api/rooms/${code}/actions`, a.id, { type: "SECRET-BODY", player: a.id });
    const refused = await request(`/api/rooms/${code}/actions?role=expert`, b.id, { type: "flip", index: 0, missionNo: 1, revision: 1 });
    expect(refused.res.status).toBe(403);
    await request(`/api/rooms/${code}/actions`, "SECRET-INVALID-TOKEN", { type: "start", ...seen });
    await request("/api/players/me", a.id, { callsign: "RENAMED" }, "PATCH");
    op.abort(); ex.abort();
    await connect(code, b.id, "expert");
    for (const type of ["symbol", "key", "override", "override", "override"]) {
      const { body: view } = await request(`/api/rooms/${code}`);
      if (view.status === "over") break;
      await request(`/api/rooms/${code}/actions`, a.id, {
        type, index: 0, position: 0, missionNo: view.missionNo, revision: view.revision,
      });
    }
    await expect.poll(() => server.events.filter(e => e.event === "mission.finished").length).toBe(1);
    const events = server.events;
    const actions = events.filter(e => e.event === "action.resolved");
    const accepted = actions.find(e => e.action === "flip" && e.result === "accepted")!;
    expect(accepted).toMatchObject({ room: code, mission: 1, previousRevision: 0, revision: 1,
      position: 0, switchUp: expect.any(Boolean), actorTag: expect.stringMatching(/^[a-f0-9]{10}$/) });
    expect(actions.find(e => e.result === "conflict")).toMatchObject({ revision: 1, observedRevision: 0 });
    expect(actions.find(e => e.reason === "malformed_action")).toMatchObject({ action: "unknown" });
    expect(actions.find(e => e.reason === "seat_permission")).toMatchObject({ actorTag: b.tag, role: "expert", httpStatus: 403 });
    expect(actions.find(e => e.reason === "unknown_player")).toMatchObject({ actorTag: null });
    expect(events.filter(e => e.event === "room.connected").map(e => e.actorTag)).toEqual([a.tag, b.tag, b.tag]);
    expect(events.find(e => e.event === "player.renamed")).toMatchObject({ actorTag: a.tag, callsign: "RENAMED" });
    expect(events.find(e => e.event === "mission.finished")).toMatchObject({ room: code, status: "over", outcome: "exploded" });
    expect(events.find(e => e.event === "request.completed" && e.requestId === accepted.requestId))
      .toMatchObject({ status: 200, route: "/api/rooms/:code/actions" });
    expect(events.every(e => e.schema === 1 && typeof e.at === "string")).toBe(true);
    const output = server.output();
    for (const secret of [a.id, b.id, "SECRET-BODY", "SECRET-INVALID-TOKEN", "?player=", '"device"']) expect(output).not.toContain(secret);
  } finally { for (const c of streams) c.abort(); await stop(server.child); rmSync(dir, { recursive: true, force: true }); }
}, 15_000);

it("correlates safe JSON parser and unexpected server errors without echoing payloads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-air-errors-"));
  const server = await boot(dir);
  try {
    for (const [route, body, status, kind] of [
      ["/api/players", '{"SECRET-PARSER":', 400, "invalid_json"],
      ["/api/players", '"' + "x".repeat(17000) + '"', 413, "body_too_large"],
      ["/api/fault", undefined, 500, "internal_error"],
    ] as const) {
      const res = await fetch(server.base + route, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", "x-request-id": "SECRET-INCOMING-ID" }, body });
      expect(res.status).toBe(status);
      const response = await res.json();
      expect(response).toMatchObject({ error: kind, requestId: res.headers.get("x-request-id") });
      await expect.poll(() => server.events.some(e => e.event === "request.failed" && e.requestId === response.requestId)).toBe(true);
    }
    expect(server.output()).not.toMatch(/SECRET-|stack|SyntaxError/);
    expect(server.errors()).toBe("");
  } finally { await stop(server.child); rmSync(dir, { recursive: true, force: true }); }
});

it("does not announce uncommitted actions when SQLite rejects a write", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-air-commit-"));
  const server = await boot(dir);
  const db = new DatabaseSync(path.join(dir, "dead-air.db"));
  try {
    const json = async (route: string, id?: string, body?: unknown) => {
      const res = await fetch(server.base + route, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...(id ? { "x-player": id } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: await res.json() };
    };
    const { body: p } = await json("/api/players", undefined, {});
    const { body: { code } } = await json("/api/rooms", p.id, {});
    db.exec("CREATE TRIGGER refuse_save BEFORE UPDATE ON rooms BEGIN SELECT RAISE(ABORT, 'SECRET-DATABASE-DETAIL'); END");
    expect((await json(`/api/rooms/${code}/actions`, p.id,
      { type: "override", missionNo: 1, revision: 0 })).status).toBe(500);
    expect((await json(`/api/rooms/${code}`)).body).toMatchObject({ status: "ready", revision: 0, strikes: 0 });
    expect(server.events.filter(e => e.event === "action.resolved" || e.event === "mission.finished")).toEqual([]);
    expect(server.output()).not.toContain("SECRET-DATABASE-DETAIL");
    db.exec("DROP TRIGGER refuse_save");
    expect((await json(`/api/rooms/${code}/actions`, p.id,
      { type: "override", missionNo: 1, revision: 0 })).status).toBe(200);
  } finally { db.close(); await stop(server.child); rmSync(dir, { recursive: true, force: true }); }
});
