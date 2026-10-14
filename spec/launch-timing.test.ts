import { afterAll, expect, it } from "vitest";
import { atFinale, steerIntoBand } from "./helpers/at-finale.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse } from "./helpers/sse.ts";
import { post, snapshot } from "./helpers/voyage.ts";

// The Lifeboat's launch against the Clock (#23): the launch moment is the end of
// the 10 s hold, not whenever the server noticed. Time is frozen, so the hold is
// begun at a chosen instant and the server restarted to look again after it.
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const CLOCK = 30 * 60_000;
const servers: SecondServer[] = [];
const start = async (options: Parameters<typeof startSecondServer>[0]): Promise<SecondServer> => {
  const s = await startSecondServer(options);
  servers.push(s);
  return s;
};
afterAll(async () => {
  for (const s of servers) await s.stop();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays to the finale at T0 with the gauges in band, then begins the hold afresh at `holdAt` and looks again at `lookAt`. */
async function holdFrom(holdAt: number, lookAt: number) {
  const first = await start({ now: T0 });
  const l = await atFinale(first.url);
  await steerIntoBand(first.url, l);
  // step one valve out of band, so the hold that began at T0 is reset and a later step back begins it afresh
  const level = (await snapshot(first.url, l.voyage.id, l.partner.cookie)).draw!.puzzles[2].instrument!;
  const by = level.valves![0] + 1 <= level.range[1] ? 1 : -1;
  const turn = (url: string, by: number) => post(url, `/api/voyages/${l.voyage.id}/intents`, l.partner.cookie, { kind: "turn-valve", deck: "Lower Deck", index: 0, by });
  expect((await turn(first.url, by)).status).toBe(200);
  for (const { stream } of l.streams) stream.close();
  await first.stop();
  const second = await start({ dataDir: first.dataDir, now: holdAt });
  // both Players are connected again, as open browsers are: a Voyage with a Player Away is frozen
  const open = await Promise.all([l.host, l.partner].map((who) => openSse(new URL(`/api/voyages/${l.voyage.id}/events`, second.url), who.cookie)));
  expect((await turn(second.url, -by)).status).toBe(200); // back in band: the hold begins at holdAt
  for (const { stream } of open) stream.close();
  await second.stop();
  const third = await start({ dataDir: first.dataDir, now: lookAt });
  await sleep(500);
  return { l, third };
}

it("a launch whose hold ends 1 s before zero wins, with that second as the Score", async () => {
  const { l, third } = await holdFrom(T0 + CLOCK - 11_000, T0 + CLOCK + 5_000);
  for (const who of [l.host, l.partner]) {
    expect((await snapshot(third.url, l.voyage.id, who.cookie)).end).toMatchObject({ outcome: "launched", scoreMs: 1000 });
  }
}, 60_000);

it("a launch whose hold ends 1 s after zero sinks the ship, and what is sent to it then is a 409, never a Strike", async () => {
  const { l, third } = await holdFrom(T0 + CLOCK - 9_000, T0 + CLOCK + 5_000);
  for (const who of [l.host, l.partner]) {
    const shot = await snapshot(third.url, l.voyage.id, who.cookie);
    expect(shot.end).toMatchObject({ outcome: "sank", scoreMs: null });
    expect(shot.draw!.strikes).toBe(0);
  }
  const lock = await post(third.url, `/api/voyages/${l.voyage.id}/intents`, l.host.cookie, { kind: "lock-in", seq: 0, deck: "Upper Deck" });
  expect(lock.status).toBe(409);
  expect((await snapshot(third.url, l.voyage.id, l.host.cookie)).draw!.strikes).toBe(0);
}, 60_000);
