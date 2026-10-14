import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { settingsFromClue } from "./helpers/finale.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { intent, post, snapshot, underway } from "./helpers/voyage.ts";

// A second server, so the events table can be read back. These tests wait out
// the real 10 s hold, so each takes a while.
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];
const SLOW = 40_000;

const snap = (voyageId: string, who: Who): Promise<LobbySnapshot> => snapshot(server.url, voyageId, who.cookie);
const finaleOf = async (voyageId: string, who: Who) => (await snap(voyageId, who)).draw!.puzzles[2];
const act = (voyageId: string, who: Who, body: Record<string, unknown>) =>
  // a deliberately stale seq: instrument inputs must never be refused for it
  post(server.url, `/api/voyages/${voyageId}/intents`, who.cookie, { seq: 0, ...body });
const turnValve = (voyageId: string, who: Who, index: number, by: 1 | -1) =>
  act(voyageId, who, { kind: "turn-valve", deck: "Lower Deck", index, by });
const turnTrim = (voyageId: string, who: Who, index: number, by: 1 | -1) =>
  act(voyageId, who, { kind: "turn-trim", deck: "Upper Deck", index, by });
const lockIn = (voyageId: string, who: Who, deck: string) => intent(server.url, voyageId, who, { kind: "lock-in", deck });

function events(voyageId: string): { action: string; actor: string | null; detail: string }[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT action, actor, detail FROM event WHERE voyage_id = ? ORDER BY id").all(voyageId) as {
    action: string;
    actor: string | null;
    detail: string;
  }[];
  db.close();
  return rows;
}

/** A Voyage with the opener and the middle solved from the Clues alone, so the finale is live. Host walks, partner keys and holds the plan. */
async function atFinale() {
  const l = await underway(server.url);
  const opener = (await snap(l.voyage.id, l.host)).draw!.puzzles[0];
  const keyed = await intent(server.url, l.voyage.id, l.partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: codeFromClue(opener.clue!) });
  expect(keyed.status).toBe(200);
  const plan = parsePlan((await snap(l.voyage.id, l.partner)).draw!.puzzles[1].clue!);
  for (const dir of routes(plan)[0]) {
    expect((await intent(server.url, l.voyage.id, l.host, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir })).status).toBe(200);
  }
  expect((await finaleOf(l.voyage.id, l.host)).status).toBe("live");
  return l;
}

/** Turns valves and trims, from the Decks' own views and the Clue text, until the readings sit in band. */
async function steerIntoBand(l: Awaited<ReturnType<typeof atFinale>>): Promise<void> {
  const target = settingsFromClue((await finaleOf(l.voyage.id, l.host)).clue!);
  const valves = (await finaleOf(l.voyage.id, l.partner)).instrument!.valves!;
  const trims = (await finaleOf(l.voyage.id, l.host)).instrument!.trims!;
  for (let i = 0; i < valves.length; i++) {
    for (let n = valves[i]; n !== target.valves[i]; n += Math.sign(target.valves[i] - n)) {
      expect((await turnValve(l.voyage.id, l.partner, i, target.valves[i] > n ? 1 : -1)).status).toBe(200);
    }
    for (let n = trims[i]; n !== target.trims[i]; n += Math.sign(target.trims[i] - n)) {
      expect((await turnTrim(l.voyage.id, l.host, i, target.trims[i] > n ? 1 : -1)).status).toBe(200);
    }
  }
}

it("every Draw has a finale that is a split instrument: the Engine Room sees valves only, the Wheelhouse gauges, trims and the Clue", async () => {
  const { voyage, host, partner } = await atFinale();
  const wheelhouse = await finaleOf(voyage.id, host);
  const engine = await finaleOf(voyage.id, partner);
  expect(wheelhouse.role).toBe("clue");
  expect(wheelhouse.clue).toMatch(/Gauge 1: target/);
  expect(wheelhouse.instrument!.readings).toHaveLength(3);
  expect(wheelhouse.instrument!.trims).toHaveLength(3);
  expect(wheelhouse.instrument!.valves).toBeUndefined();
  expect(engine.role).toBe("lock");
  expect(engine.instrument!.valves).toHaveLength(3);
  expect(JSON.stringify(engine)).not.toMatch(/target|Gauge|readings|trims|step/);
  expect((await snap(voyage.id, partner)).draw!.puzzles.map((p) => p.slot)).toEqual(["opener", "middle", "finale"]);
});

it("the instrument is dead until the puzzle before it is solved, and a typed answer never opens it", async () => {
  const { voyage, host, partner } = await underway(server.url);
  expect((await turnValve(voyage.id, partner, 0, 1)).status).toBe(409);
  expect((await turnTrim(voyage.id, host, 0, 1)).status).toBe(409);
  expect((await lockIn(voyage.id, host, "Upper Deck")).status).toBe(409);
  const l = await atFinale();
  const res = await intent(server.url, l.voyage.id, l.partner, { kind: "submit", deck: "Lower Deck", slot: "finale", answer: "1234" });
  expect(res.status).toBe(409);
  expect((await snap(l.voyage.id, l.host)).draw!.strikes).toBe(0);
});

it("each Deck turns only its own dials", async () => {
  const { voyage, host, partner } = await atFinale();
  expect((await act(voyage.id, host, { kind: "turn-valve", deck: "Upper Deck", index: 0, by: 1 })).status).toBe(409);
  expect((await act(voyage.id, partner, { kind: "turn-trim", deck: "Lower Deck", index: 0, by: 1 })).status).toBe(409);
  expect((await act(voyage.id, host, { kind: "turn-valve", deck: "Lower Deck", index: 0, by: 1 })).status).toBe(403);
  expect((await turnValve(voyage.id, partner, 7, 1)).status).toBe(400);
});

it("both Decks' inputs inside the same second are all applied in server order, none lost", async () => {
  const { voyage, host, partner } = await atFinale();
  const valve0 = (await finaleOf(voyage.id, partner)).instrument!.valves![0];
  const trim0 = (await finaleOf(voyage.id, host)).instrument!.trims![0];
  const vBy = valve0 >= 5 ? -1 : 1;
  const tBy = trim0 <= 0 ? 1 : -1;
  const sent = await Promise.all([
    ...[0, 1, 2].map(() => turnValve(voyage.id, partner, 0, vBy)),
    ...[0, 1, 2].map(() => turnTrim(voyage.id, host, 0, tBy)),
  ]);
  expect(sent.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
  expect((await finaleOf(voyage.id, partner)).instrument!.valves![0]).toBe(valve0 + 3 * vBy);
  expect((await finaleOf(voyage.id, host)).instrument!.trims![0]).toBe(trim0 + 3 * tBy);
});

it("a lock-in pressed off target is a Strike that names no Player", async () => {
  const { voyage, host } = await atFinale();
  expect((await lockIn(voyage.id, host, "Upper Deck")).status).toBe(200);
  expect((await snap(voyage.id, host)).draw!.strikes).toBe(1);
  const logged = events(voyage.id).filter((e) => e.action === "strike");
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBeNull();
  expect((await finaleOf(voyage.id, host)).status).toBe("live");
});

it("ten seconds in band launches the Lifeboat on both Decks with one bell, and a lock-in on target is no Strike", async () => {
  const l = await atFinale();
  const { voyage, host, partner } = l;
  const a = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), host.cookie);
  const b = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), partner.cookie);

  await steerIntoBand(l);
  expect((await finaleOf(voyage.id, host)).instrument!.holdMs).toBeGreaterThanOrEqual(0);
  expect((await lockIn(voyage.id, host, "Upper Deck")).status).toBe(200);
  expect((await snap(voyage.id, host)).draw!.strikes).toBe(0);
  expect((await finaleOf(voyage.id, host)).status).toBe("live");

  for (const s of [a.stream, b.stream]) {
    let frame = parseFrame(await s.next(15_000));
    const seen: string[] = [];
    while (frame.event !== "bell") {
      seen.push(frame.event);
      frame = parseFrame(await s.next(15_000));
    }
    expect(frame.data).toEqual({ slot: "finale" });
    expect(seen).not.toContain("strike");
  }
  a.stream.close();
  b.stream.close();
  for (const who of [host, partner]) {
    const shot = await snap(voyage.id, who);
    expect(shot.draw!.puzzles[2].status).toBe("solved");
    expect(shot.draw!.strikes).toBe(0);
  }
  expect(events(voyage.id).filter((e) => e.action === "puzzle.solved" && e.detail.includes("finale"))).toHaveLength(1);
}, SLOW);

it("drifting out of band resets the hold and is never a Strike", async () => {
  const l = await atFinale();
  const { voyage, host, partner } = l;
  await steerIntoBand(l);
  const startedAt = Date.now();
  await new Promise((r) => setTimeout(r, 3000));
  expect((await finaleOf(voyage.id, host)).instrument!.holdMs).toBeGreaterThanOrEqual(2500);

  expect((await turnValve(voyage.id, partner, 0, 1)).status).toBe(200); // one notch moves a gauge by 2 or 3, out of its band
  let wheelhouse = await finaleOf(voyage.id, host);
  expect(wheelhouse.instrument!.holdMs).toBeNull();
  expect((await snap(voyage.id, host)).draw!.strikes).toBe(0);

  // past the moment the first hold would have launched
  await new Promise((r) => setTimeout(r, Math.max(0, startedAt + 11_000 - Date.now())));
  wheelhouse = await finaleOf(voyage.id, host);
  expect(wheelhouse.status).toBe("live");
  expect((await snap(voyage.id, host)).draw!.strikes).toBe(0);

  expect((await turnValve(voyage.id, partner, 0, -1)).status).toBe(200); // back in band: the hold starts again from zero
  expect((await finaleOf(voyage.id, host)).instrument!.holdMs).toBeLessThan(2000);
}, SLOW);
