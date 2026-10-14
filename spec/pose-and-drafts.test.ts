import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { post, snapshot, underway } from "./helpers/voyage.ts";

// A second server, so the events table and stdout can be read back.
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

type Who = { cookie: string };
const send = (voyageId: string, who: Who, body: unknown) => post(server.url, `/api/voyages/${voyageId}/intents`, who.cookie, body);
const snap = (voyageId: string, who: Who) => snapshot(server.url, voyageId, who.cookie);
const pose = { kind: "pose", x: 1.5, y: 1.6, z: -2, yaw: 0.5, pitch: -0.2 };

function actions(voyageId: string): string[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT action FROM event WHERE voyage_id = ? ORDER BY id").all(voyageId) as { action: string }[];
  db.close();
  return rows.map((r) => r.action);
}

it("a Player's pose comes back in their own snapshot after a reload", async () => {
  const { voyage, host } = await underway(server.url);
  expect((await snap(voyage.id, host)).pose).toBeNull();
  expect((await send(voyage.id, host, pose)).status).toBe(200);
  expect((await snap(voyage.id, host)).pose).toEqual({ x: 1.5, y: 1.6, z: -2, yaw: 0.5, pitch: -0.2 });
});

it("the latest pose overwrites the one before", async () => {
  const { voyage, host } = await underway(server.url);
  await send(voyage.id, host, pose);
  await send(voyage.id, host, { ...pose, x: 3 });
  expect((await snap(voyage.id, host)).pose?.x).toBe(3);
});

it("a pose is clamped: out-of-range position and pitch are pulled in, yaw wraps, and a non-number is a 400", async () => {
  const { voyage, host } = await underway(server.url);
  await send(voyage.id, host, { kind: "pose", x: 9999, y: -9999, z: 9999, yaw: 7, pitch: 9 });
  const p = (await snap(voyage.id, host)).pose!;
  expect(Math.abs(p.x)).toBeLessThanOrEqual(100);
  expect(Math.abs(p.y)).toBeLessThanOrEqual(100);
  expect(Math.abs(p.z)).toBeLessThanOrEqual(100);
  expect(Math.abs(p.pitch)).toBeLessThanOrEqual(Math.PI / 2);
  expect(p.yaw).toBeGreaterThan(-Math.PI);
  expect(p.yaw).toBeLessThanOrEqual(Math.PI);
  expect((await send(voyage.id, host, { ...pose, x: "far" })).status).toBe(400);
  expect((await send(voyage.id, host, { ...pose, x: null })).status).toBe(400);
});

it("a pose goes only to its owner: the partner's snapshot carries none of it", async () => {
  const { voyage, host, partner } = await underway(server.url);
  await send(voyage.id, host, pose);
  expect((await snap(voyage.id, partner)).pose).toBeNull();
  await send(voyage.id, partner, { ...pose, x: -4 });
  expect((await snap(voyage.id, host)).pose?.x).toBe(1.5);
  expect((await snap(voyage.id, partner)).pose?.x).toBe(-4);
});

it("a keypad draft survives a reload for its owner only", async () => {
  const { voyage, host, partner } = await underway(server.url);
  expect((await snap(voyage.id, partner)).drafts).toEqual({});
  expect((await send(voyage.id, partner, { kind: "keypad-draft", slot: "opener", text: "48" })).status).toBe(200);
  expect((await snap(voyage.id, partner)).drafts).toEqual({ opener: "48" });
  expect((await snap(voyage.id, host)).drafts).toEqual({});
  await send(voyage.id, partner, { kind: "keypad-draft", slot: "opener", text: "" });
  expect((await snap(voyage.id, partner)).drafts).toEqual({});
  expect((await send(voyage.id, partner, { kind: "keypad-draft", slot: "opener", text: "12345" })).status).toBe(400);
  expect((await send(voyage.id, partner, { kind: "keypad-draft", slot: "opener", text: "ab" })).status).toBe(400);
});

it("both kinds still need a seat, but skip the 409 checks: a stale seq or an ended Voyage still saves", async () => {
  const { voyage, host } = await underway(server.url);
  expect((await send(voyage.id, host, { ...pose, seq: 0 })).status).toBe(200);
  const made = await post(server.url, "/api/guest", null);
  const stranger = { cookie: made.headers.getSetCookie()[0].split(";")[0] };
  expect((await send(voyage.id, stranger, pose)).status).toBe(403);
  expect((await send(voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
  expect((await send(voyage.id, host, { kind: "keypad-draft", slot: "opener", text: "7" })).status).toBe(200);
});

it("neither kind reaches the events table or stdout", async () => {
  const { voyage, host } = await underway(server.url);
  const before = actions(voyage.id);
  const out = server.output().length;
  await send(voyage.id, host, { kind: "pose", x: 12.3456789, y: 1.6, z: 7.7654321, yaw: 0.123456, pitch: 0.1 });
  await send(voyage.id, host, { kind: "keypad-draft", slot: "opener", text: "9317" });
  expect(actions(voyage.id)).toEqual(before);
  const printed = server.output().slice(out);
  expect(printed).not.toMatch(/pose|keypad-draft|12\.3456789|7\.7654321|9317/);
});
