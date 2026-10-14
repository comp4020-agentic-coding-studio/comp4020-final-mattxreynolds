import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, expect, it } from "vitest";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { intent, snapshot, underway } from "./helpers/voyage.ts";

// Frozen-clock second servers: the Clock is a pure function of stored state and
// now(), so a restart on the same DATA_DIR with a later FAKE_NOW moves time.
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const MIN = 60_000;
const servers: SecondServer[] = [];
const start = async (options: Parameters<typeof startSecondServer>[0]) => {
  const s = await startSecondServer(options);
  servers.push(s);
  return s;
};
afterAll(async () => {
  for (const s of servers) await s.stop();
});

type Who = Parameters<typeof intent>[2];
const wrong = (server: SecondServer, voyageId: string, who: Who) =>
  intent(server.url, voyageId, who, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: "0000" });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function events(server: SecondServer, voyageId: string): { action: string; detail: string }[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT action, detail FROM event WHERE voyage_id = ? ORDER BY id").all(voyageId) as { action: string; detail: string }[];
  db.close();
  return rows;
}

it("the Clock starts at cast off with 30 minutes, and each Strike takes 3 minutes off", async () => {
  const server = await start({ now: T0 });
  const { voyage, host, partner } = await underway(server.url);
  const before = (await snapshot(server.url, voyage.id, host.cookie)) as LobbySnapshot;
  expect(before.clock).toEqual({ secondsLeft: 1800 });
  expect(before.draw!.strikes).toBe(0);
  await wrong(server, voyage.id, partner); // "0000" is a Strike unless it is the code (1 in 10000)
  const after = await snapshot(server.url, voyage.id, partner.cookie);
  expect(after.draw!.strikes).toBe(1);
  expect(after.clock).toEqual({ secondsLeft: 1800 - 180 });
});

it("before cast off there is no Clock", async () => {
  const server = await start({ now: T0 });
  const { voyage, host } = await (await import("./helpers/voyage.ts")).lobby(server.url);
  expect((await snapshot(server.url, voyage.id, host.cookie)).clock).toBeNull();
});

it("the third Strike sinks the ship: it is logged, both Decks see it ended, and nothing more is accepted", async () => {
  const server = await start({ now: T0 });
  const { voyage, host, partner } = await underway(server.url);
  for (let i = 0; i < 3; i++) {
    expect((await wrong(server, voyage.id, partner)).status).toBe(200);
    await pause(1100); // the answer throttle allows about one a second
  }
  for (const who of [host, partner]) expect((await snapshot(server.url, voyage.id, who.cookie)).ended).toBe(true);
  expect((await wrong(server, voyage.id, partner)).status).toBe(409);
  const sank = events(server, voyage.id).filter((e) => e.action === "voyage.sank");
  expect(sank).toHaveLength(1);
  expect(JSON.parse(sank[0].detail)).toMatchObject({ reason: "strikes" });
}, 20_000);

it("an answer thrown in faster than the throttle is a 429 and never a Strike", async () => {
  const server = await start({ now: T0 });
  const { voyage, partner } = await underway(server.url);
  expect((await wrong(server, voyage.id, partner)).status).toBe(200);
  expect((await wrong(server, voyage.id, partner)).status).toBe(429);
  expect((await wrong(server, voyage.id, partner)).status).toBe(429);
  expect((await snapshot(server.url, voyage.id, partner.cookie)).draw!.strikes).toBe(1);
});

it("the Clock reaching zero sinks the ship when next looked at; one second before, the Voyage is still alive", async () => {
  const first = await start({ now: T0 });
  const { voyage, host, partner } = await underway(first.url);
  await first.stop();
  const nearly = await start({ dataDir: first.dataDir, now: T0 + 30 * MIN - 1000 });
  const alive = await snapshot(nearly.url, voyage.id, host.cookie);
  expect(alive.clock).toEqual({ secondsLeft: 1 });
  expect(alive.ended).toBe(false);
  await nearly.stop();
  const late = await start({ dataDir: first.dataDir, now: T0 + 30 * MIN });
  expect((await snapshot(late.url, voyage.id, host.cookie)).ended).toBe(true);
  expect((await wrong(late, voyage.id, partner)).status).toBe(409);
  expect(events(late, voyage.id).filter((e) => e.action === "voyage.sank")).toHaveLength(1);
});

it("no intent can set a Score, and a Score is not in any snapshot", async () => {
  const server = await start({ now: T0 });
  const { voyage, host } = await underway(server.url);
  const res = await intent(server.url, voyage.id, host, { kind: "end-voyage", score: 1_800_000 });
  expect(res.status).toBe(400);
  expect(JSON.stringify(await snapshot(server.url, voyage.id, host.cookie))).not.toMatch(/score/i);
});
