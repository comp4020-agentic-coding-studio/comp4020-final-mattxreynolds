import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { atFinale, steerIntoBand } from "./helpers/at-finale.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { intent, snapshot, underway } from "./helpers/voyage.ts";

// Away (#56): a ticking fake clock, so the Clock can be seen to run and to stop.
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const SLOW = 60_000;
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer({ now: T0, ticking: true });
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];
const turn = (who: Who, kind: string, deck: string, by: number) =>
  fetch(new URL(`/api/voyages/${current}/intents`, server.url), {
    method: "POST",
    headers: { cookie: who.cookie, "content-type": "application/json" },
    body: JSON.stringify({ seq: 0, kind, deck, index: 0, by }),
  });
let current = "";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const watch = (voyageId: string, who: Who) => openSse(new URL(`/api/voyages/${voyageId}/events`, server.url), who.cookie);
const snap = (voyageId: string, who: Who): Promise<LobbySnapshot> => snapshot(server.url, voyageId, who.cookie);

function events(voyageId: string): { at: number; action: string; actor: string | null }[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT at, action, actor FROM event WHERE voyage_id = ? ORDER BY id").all(voyageId) as { at: number; action: string; actor: string | null }[];
  db.close();
  return rows;
}

/** Both Players connected, the way two open browsers are. */
async function bothOn(voyageId: string, host: Who, partner: Who) {
  return { host: await watch(voyageId, host), partner: await watch(voyageId, partner) };
}

it("a drop that is back inside 8 s changes nothing, and the Clock runs through the grace period", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const on = await bothOn(voyage.id, host, partner);
  const before = (await snap(voyage.id, host)).clock!.secondsLeft;
  on.partner.stream.close();
  await pause(5000);
  const back = await watch(voyage.id, partner);
  await pause(5000); // past 8 s since the drop: the new stream cancels the Away check
  const after = await snap(voyage.id, host);
  expect(after.paused).toBe(false);
  expect(before - after.clock!.secondsLeft).toBeGreaterThanOrEqual(9);
  expect(events(voyage.id).map((e) => e.action)).not.toContain("voyage.frozen");
  on.host.stream.close();
  back.stream.close();
}, SLOW);

it("the Clock stops after exactly 8 s closed, the partner sees it paused, and it resumes by itself when both are back", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const on = await bothOn(voyage.id, host, partner);
  on.partner.stream.close();
  await pause(4000);
  expect((await snap(voyage.id, host)).paused).toBe(false); // still in grace
  await expect.poll(async () => (await snap(voyage.id, host)).paused, { timeout: 15_000, interval: 250 }).toBe(true);
  const frozen = await snap(voyage.id, host);
  expect(frozen.paused).toBe(true);
  expect(frozen.voyage.code).toBeTruthy();
  const secs = frozen.clock!.secondsLeft;
  await pause(3000);
  expect((await snap(voyage.id, host)).clock!.secondsLeft).toBe(secs);

  const log = events(voyage.id);
  const dropped = log.find((e) => e.action === "stream.closed" && e.actor === partner.id)!;
  const away = log.find((e) => e.action === "presence.away")!;
  expect(away.actor).toBe(partner.id);
  expect(log.find((e) => e.action === "voyage.frozen")!.at).toBe(away.at);
  expect(away.at - dropped.at).toBeGreaterThanOrEqual(7900);
  expect(away.at - dropped.at).toBeLessThanOrEqual(8200);

  const back = await watch(voyage.id, partner);
  await pause(500);
  const resumed = await snap(voyage.id, host);
  expect(resumed.paused).toBe(false);
  await pause(3000);
  expect(secs - (await snap(voyage.id, host)).clock!.secondsLeft).toBeGreaterThanOrEqual(2);
  expect(events(voyage.id).map((e) => e.action)).toEqual(expect.arrayContaining(["presence.back", "voyage.resumed"]));
  on.host.stream.close();
  back.stream.close();
}, SLOW);

it("a dropped stream reconnects to a full snapshot with nothing lost", async () => {
  const { voyage, host, partner } = await underway(server.url);
  await intent(server.url, voyage.id, partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: "0000" });
  const first = await watch(voyage.id, host);
  first.stream.close();
  const again = await watch(voyage.id, host);
  const shot = parseFrame(await again.stream.next()).data as LobbySnapshot;
  expect(shot.draw!.strikes).toBe(1);
  expect(shot.started).toBe(true);
  again.stream.close();
}, SLOW);

it("the finale hold continues within grace", async () => {
  const l = await atFinale(server.url);
  const { voyage, host, partner } = l;
  const on = { host: l.streams[0], partner: l.streams[1] };
  await steerIntoBand(server.url, l);
  const hold = async () => (await snap(voyage.id, host)).draw!.puzzles[2].instrument!.holdMs;
  await pause(1000);
  on.partner.stream.close();
  await pause(3000);
  const back = await watch(voyage.id, partner);
  await pause(500);
  expect((await snap(voyage.id, host)).paused).toBe(false);
  expect(await hold()).toBeGreaterThanOrEqual(4000); // the drop did not reset it
  on.host.stream.close();
  back.stream.close();
}, SLOW);

it("the finale hold resets on a freeze, and starts afresh when both are back", async () => {
  const l = await atFinale(server.url);
  const { voyage, host, partner } = l;
  current = voyage.id;
  const on = { host: l.streams[0], partner: l.streams[1] };
  await steerIntoBand(server.url, l);
  const hold = async () => (await snap(voyage.id, host)).draw!.puzzles[2].instrument!.holdMs;
  expect(await hold()).not.toBeNull();
  // knock a gauge out and back so the hold starts now, then drop: the freeze lands 8 s into the 10 s hold
  await turn(partner, "turn-valve", "Lower Deck", 1);
  await turn(partner, "turn-valve", "Lower Deck", -1);
  on.partner.stream.close();
  await expect.poll(async () => (await snap(voyage.id, host)).paused, { timeout: 15_000, interval: 500 }).toBe(true);
  expect(await hold()).toBeNull(); // reset by the freeze, not carried over

  const back = await watch(voyage.id, partner);
  await pause(1000);
  const restarted = await hold();
  expect(restarted).not.toBeNull();
  expect(restarted!).toBeLessThan(2500); // fresh from zero
  expect((await snap(voyage.id, host)).draw!.puzzles[2].status).toBe("live");
  on.host.stream.close();
  back.stream.close();
}, SLOW);
