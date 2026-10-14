import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { playToFinaleHold } from "./helpers/launch.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { guest, post, snapshot, underway } from "./helpers/voyage.ts";

// The Leaderboard (#67): a Score is posted only with both Players' consent,
// anyone reads it live, and it never shows a Draw, Clue or answer.
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const SCORE = 30 * 60_000 - 10_000;
let server: SecondServer;
type Played = Awaited<ReturnType<typeof playToFinaleHold>>;
let launched: Played;
let launchedToo: Played;
let sank: Awaited<ReturnType<typeof underway>>;

type Entries = { entries: { rank: number; players: string; scoreMs: number }[] };
const board = async () => (await (await fetch(new URL("/api/leaderboard", server.url))).json()) as Entries;
const consent = (v: Played, who: "host" | "partner", yes = true) =>
  post(server.url, `/api/voyages/${v.voyage.id}/post-score`, v[who].cookie, { consent: yes });
const offerOf = async (v: Played, who: "host" | "partner") => (await snapshot(server.url, v.voyage.id, v[who].cookie)).post;
const names = (v: Played): string => [v.host.name, v.partner.name].sort().join(" + ");
const sleep =(ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  server = await startSecondServer({ now: T0 });
  launched = await playToFinaleHold(server.url);
  launchedToo = await playToFinaleHold(server.url);
  sank = await underway(server.url);
  await server.stop();
  // the holds began at T0; 11 s later a restart looks again and launches both
  server = await startSecondServer({ dataDir: server.dataDir, now: T0 + 11_000 });
  await sleep(500);
}, 120_000);
afterAll(async () => {
  await server.stop();
});

it("anyone can read an empty Leaderboard without signing in", async () => {
  const res = await fetch(new URL("/api/leaderboard", server.url));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ entries: [] });
});

it("after a launch each Player is offered a preview; one consent alone posts nothing", async () => {
  expect(await offerOf(launched, "host")).toEqual({
    scoreMs: SCORE,
    players: [launched.host.name, launched.partner.name].sort(),
    youConsented: false,
    partnerConsented: false,
    posted: false,
  });
  expect((await consent(launched, "host")).status).toBe(200);
  expect(await offerOf(launched, "host")).toMatchObject({ youConsented: true, partnerConsented: false, posted: false });
  expect(await offerOf(launched, "partner")).toMatchObject({ youConsented: false, partnerConsented: true, posted: false });
  expect((await board()).entries).toEqual([]);
}, 30_000);

it("consent can be withdrawn before the Score is posted", async () => {
  expect((await consent(launched, "host", false)).status).toBe(200);
  expect(await offerOf(launched, "host")).toMatchObject({ youConsented: false, posted: false });
  expect((await consent(launched, "host")).status).toBe(200);
}, 30_000);

it("a Voyage that did not launch offers nothing and refuses consent; strangers, the anonymous and bad bodies are refused", async () => {
  expect((await snapshot(server.url, sank.voyage.id, sank.host.cookie)).post).toBeNull();
  const url = (v: { voyage: { id: string } }) => `/api/voyages/${v.voyage.id}/post-score`;
  expect((await post(server.url, url(sank), sank.host.cookie, { consent: true })).status).toBe(409);
  const stranger = await guest(server.url);
  expect((await post(server.url, url(launched), stranger.cookie, { consent: true })).status).toBe(403);
  expect((await post(server.url, url(launched), null, { consent: true })).status).toBe(401);
  expect((await post(server.url, url(launched), launched.host.cookie, { consent: "yes" })).status).toBe(400);
}, 30_000);

it("a reader who isn't signed in sees the entry appear live once the second Player agrees, with no Draw, Clue or answer", async () => {
  const { status, stream } = await openSse(new URL("/api/leaderboard/events", server.url), "");
  expect(status).toBe(200);
  const first = parseFrame(await stream.next(10_000));
  expect(first.event).toBe("leaderboard");
  expect(first.data).toEqual({ entries: [] });

  expect((await consent(launched, "partner")).status).toBe(200);
  const next = parseFrame(await stream.next(10_000));
  stream.close();
  expect(next.data).toEqual({ entries: [{ rank: 1, players: names(launched), scoreMs: SCORE }] });

  expect(JSON.stringify(await board())).not.toMatch(/draw|clue|answer|puzzle|voyage|code|"id"/i);
  expect(await offerOf(launched, "host")).toMatchObject({ posted: true });
  expect((await consent(launched, "host", false)).status).toBe(409); // once posted, only the hide script removes it
}, 30_000);

it("the hide script removes an entry from the public view", async () => {
  expect((await consent(launchedToo, "host")).status).toBe(200);
  expect((await consent(launchedToo, "partner")).status).toBe(200);
  expect((await board()).entries).toHaveLength(2);
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/hide-entry.ts", ...args], { env: { ...process.env, DATA_DIR: server.dataDir }, encoding: "utf8" });
  const listing = run("--list");
  expect(listing.status).toBe(0);
  expect(listing.stdout).toContain(launchedToo.voyage.id);
  expect(run(launchedToo.voyage.id).status).toBe(0);
  const entries = (await board()).entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].players).toBe(names(launched));
  expect(run("v_nope").status).not.toBe(0);
}, 30_000);
