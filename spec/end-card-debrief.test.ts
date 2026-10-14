import { afterAll, beforeAll, expect, it } from "vitest";
import type { Debrief } from "../shared/lobby.ts";
import { settingsFromClue } from "./helpers/finale.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { guest, intent, post, snapshot, underway } from "./helpers/voyage.ts";

// The end card and the both-Decks debrief (#60). Time is frozen so the Score is exact.
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer({ now: T0 });
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];
const snap = (voyageId: string, who: Who) => snapshot(server.url, voyageId, who.cookie);
const debrief = (voyageId: string, cookie?: string) =>
  fetch(new URL(`/api/voyages/${voyageId}/debrief`, server.url), { headers: cookie ? { cookie } : {} });
const submit = (voyageId: string, who: Who, answer: string) =>
  intent(server.url, voyageId, who, { kind: "submit", deck: "Lower Deck", slot: "opener", answer });
const wrong = (code: string): string => (code[0] === "0" ? "1" : "0") + code.slice(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("a Voyage that went down by Strikes shows the end card with no Score, three Strikes and what was solved", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await snap(voyage.id, host)).draw!.puzzles[0].clue!);
  for (let i = 0; i < 3; i++) {
    expect((await submit(voyage.id, partner, wrong(code))).status).toBe(200);
    await sleep(1100); // the answer throttle
  }
  for (const who of [host, partner]) {
    const s = await snap(voyage.id, who);
    expect(s.ended).toBe(true);
    expect(s.end).toEqual({ outcome: "sank", scoreMs: null, strikes: 3, solved: 0, total: 3 });
  }
}, 30_000);

it("a Voyage ended by a Player shows the end card with its Strikes and Puzzles solved", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await snap(voyage.id, host)).draw!.puzzles[0].clue!);
  expect((await submit(voyage.id, partner, code)).status).toBe(200);
  expect((await intent(server.url, voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
  for (const who of [host, partner]) {
    expect((await snap(voyage.id, who)).end).toEqual({ outcome: "abandoned", scoreMs: null, strikes: 0, solved: 1, total: 3 });
  }
});

it("a live Voyage has no end card and no debrief: refused to its own Players (409), strangers (403) and the anonymous (401)", async () => {
  const { voyage, host, partner } = await underway(server.url);
  expect((await snap(voyage.id, host)).end).toBeNull();
  expect((await debrief(voyage.id, host.cookie)).status).toBe(409);
  expect((await debrief(voyage.id, partner.cookie)).status).toBe(409);
  expect((await debrief(voyage.id, (await guest(server.url)).cookie)).status).toBe(403);
  expect((await debrief(voyage.id)).status).toBe(401);
});

it("a launched Voyage shows the Score on the end card, and either Player opens a debrief of both Decks and the timeline", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const openerClue = (await snap(voyage.id, host)).draw!.puzzles[0].clue!;
  expect((await submit(voyage.id, partner, codeFromClue(openerClue))).status).toBe(200);
  const planClue = (await snap(voyage.id, partner)).draw!.puzzles[1].clue!;
  for (const dir of routes(parsePlan(planClue))[0]) {
    expect((await intent(server.url, voyage.id, host, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir })).status).toBe(200);
  }
  const finale = (await snap(voyage.id, host)).draw!.puzzles[2];
  const target = settingsFromClue(finale.clue!);
  const dial = (who: Who, kind: string, deck: string, index: number, by: number) =>
    post(server.url, `/api/voyages/${voyage.id}/intents`, who.cookie, { seq: 0, kind, deck, index, by });
  const valves = (await snap(voyage.id, partner)).draw!.puzzles[2].instrument!.valves!;
  const trims = finale.instrument!.trims!;
  for (let i = 0; i < valves.length; i++) {
    for (let n = valves[i]; n !== target.valves[i]; n += Math.sign(target.valves[i] - n)) await dial(partner, "turn-valve", "Lower Deck", i, Math.sign(target.valves[i] - n));
    for (let n = trims[i]; n !== target.trims[i]; n += Math.sign(target.trims[i] - n)) await dial(host, "turn-trim", "Upper Deck", i, Math.sign(target.trims[i] - n));
  }
  // the hold began at T0 and is complete at T0 + 10 s: a restart 11 s later looks again and launches
  await server.stop();
  server = await startSecondServer({ dataDir: server.dataDir, now: T0 + 11_000 });
  await sleep(500);
  for (const who of [host, partner]) {
    expect((await snap(voyage.id, who)).end).toEqual({ outcome: "launched", scoreMs: 30 * 60_000 - 10_000, strikes: 0, solved: 3, total: 3 });
  }

  for (const who of [host, partner]) {
    const res = await debrief(voyage.id, who.cookie);
    expect(res.status).toBe(200);
    const d = (await res.json()) as Debrief;
    expect(d.ship).toBe(voyage.ship);
    expect(d.end.outcome).toBe("launched");
    expect(d.decks.map((x) => [x.deck, x.room, x.player?.name])).toEqual([
      ["Upper Deck", "Wheelhouse", host.name],
      ["Lower Deck", "Engine Room", partner.name],
    ]);
    // each Deck holds the Clues for the other's Puzzles, and the debrief shows both sets
    const [upper, lower] = d.decks.map((x) => x.puzzles);
    expect(upper.map((p) => [p.slot, p.role, p.solved])).toEqual([["opener", "clue", true], ["middle", "lock", true], ["finale", "clue", true]]);
    expect(lower.map((p) => [p.slot, p.role, p.solved])).toEqual([["opener", "lock", true], ["middle", "clue", true], ["finale", "lock", true]]);
    expect(upper[0].clue).toBe(openerClue);
    expect(lower[1].clue).toBe(planClue);
    expect(upper[1].clue).toBeNull();
    expect(upper[2].clue).toBe(finale.clue);
    const text = d.timeline.map((e) => e.text);
    expect(text.some((t) => /cast off/i.test(t))).toBe(true);
    expect(text.some((t) => /launched/i.test(t))).toBe(true);
    expect(text.some((t) => /opener/i.test(t) && /solved/i.test(t))).toBe(true);
    expect(d.timeline.some((e) => e.actor === host.name || e.actor === partner.name)).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/token|cookie|"code"/i);
  }
  expect((await debrief(voyage.id, (await guest(server.url)).cookie)).status).toBe(403);
}, 60_000);
