import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { RoomView } from "../shared/view.ts";

// Real API router in an independent process, on port 0; no static build needed.
async function boot(dir: string) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import express from 'express';
    import { players } from './server/players.ts';
    import { roomRoutes, logRoutes } from './server/rooms.ts';
    const app = express(); app.use(express.json());
    app.use('/api/players', players); app.use('/api/rooms', roomRoutes); app.use('/api/log', logRoutes);
    const s = app.listen(0, '127.0.0.1', () => console.log(s.address().port));
  `], { env: { ...process.env, DATA_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr!.on("data", chunk => { stderr += chunk; });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`API did not start: ${stderr}`)); }, 5000);
    child.stdout!.once("data", data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    child.once("error", e => { clearTimeout(timer); reject(e); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(stderr)); });
  });
  return { child, base: `http://127.0.0.1:${port}`, errors: () => stderr };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const ended = once(child, "exit"); child.kill("SIGTERM"); await ended;
}
async function json(base: string, route: string, id?: string, body?: unknown) {
  const res = await fetch(base + route, { method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(id ? { "x-player": id } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  expect(res.ok).toBe(true); return res.json();
}

it("recovers live missions, revisions and a late-joining crew, and records downtime expiry once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-air-restart-"));
  let server: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    server = await boot(dir);
    const p = await json(server.base, "/api/players", undefined, {});
    const late = await json(server.base, "/api/players", undefined, {});
    const { code } = await json(server.base, "/api/rooms", p.id, {});
    await json(server.base, `/api/rooms/${code}/actions`, p.id,
      { type: "flip", index: 0, missionNo: 1, revision: 0 });
    const stream = await fetch(`${server.base}/api/rooms/${code}/stream?role=expert&player=${late.id}`);
    const reader = stream.body!.getReader(); await reader.read(); await reader.cancel();
    const live: RoomView = await json(server.base, `/api/rooms/${code}`);
    await stop(server.child);
    server = await boot(dir);
    const recovered: RoomView = await json(server.base, `/api/rooms/${code}`);
    expect(recovered.device).toEqual(live.device);
    expect(recovered.revision).toBe(live.revision);
    expect(recovered.endsAt).toBe(live.endsAt);
    expect(recovered.status).toBe("live");
    expect(recovered.crew).toEqual([]); // connection presence is intentionally transient
    const stale = await fetch(`${server.base}/api/rooms/${code}/actions`, {
      method: "POST", headers: { "content-type": "application/json", "x-player": p.id },
      body: JSON.stringify({ type: "flip", index: 0, missionNo: 1, revision: 0 }),
    });
    expect(stale.status).toBe(409);
    await stop(server.child);
    const db = new DatabaseSync(path.join(dir, "dead-air.db"));
    const row = db.prepare("SELECT state FROM rooms WHERE code = ?").get(code)!;
    const state = JSON.parse(String(row.state));
    expect(state.mission.crew[late.tag]).toBe(late.callsign);
    state.mission.endsAt = Date.now() - 1; // emulate downtime beyond the persisted deadline
    db.prepare("UPDATE rooms SET state = ? WHERE code = ?").run(JSON.stringify(state), code);
    db.close();
    server = await boot(dir);
    const end = await json(server.base, `/api/rooms/${code}?role=expert`);
    expect(end.status).toBe("over"); expect(end.outcome).toBe("timeout");
    expect(end.revision).toBe(live.revision + 1); expect(end.msLeft).toBe(0);
    expect(end.device).toBeUndefined();
    const log = await json(server.base, "/api/log", late.id);
    expect(log.runs.filter((r: { roomCode: string }) => r.roomCode === code)).toHaveLength(1);
    expect(log.runs[0].mine).toBe(true);
    await stop(server.child); server = await boot(dir);
    expect((await json(server.base, "/api/log")).runs).toHaveLength(1);
    expect(server.errors()).toBe("");
  } finally { if (server) await stop(server.child); rmSync(dir, { recursive: true, force: true }); }
}, 15_000);

it("opens a persisted C8 room with revision zero without changing its device or deadline", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dead-air-c8-"));
  let server: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    server = await boot(dir);
    const p = await json(server.base, "/api/players", undefined, {});
    const { code } = await json(server.base, "/api/rooms", p.id, {});
    const before = await json(server.base, `/api/rooms/${code}`);
    await stop(server.child);
    const db = new DatabaseSync(path.join(dir, "dead-air.db"));
    const state = JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE code = ?").get(code)!.state));
    delete state.revision;
    db.prepare("UPDATE rooms SET state = ? WHERE code = ?").run(JSON.stringify(state), code); db.close();
    server = await boot(dir);
    const recovered = await json(server.base, `/api/rooms/${code}`);
    expect(recovered.revision).toBe(0); expect(recovered.device).toEqual(before.device);
    expect(recovered.endsAt).toBe(before.endsAt);
    expect((await json(server.base, `/api/rooms/${code}/actions`, p.id,
      { type: "start", missionNo: 1, revision: 0 })).revision).toBe(1);
  } finally { if (server) await stop(server.child); rmSync(dir, { recursive: true, force: true }); }
}, 10_000);
