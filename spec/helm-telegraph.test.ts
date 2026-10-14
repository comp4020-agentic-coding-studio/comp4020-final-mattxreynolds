import { expect, it } from "vitest";
import { inject } from "vitest";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { atFinale, steerIntoBand } from "./helpers/at-finale.ts";
import { intent, post, snapshot } from "./helpers/voyage.ts";

// The finale's Puzzle B, played over the wire (#64). The 10 s hold is real time.
const base = inject("baseUrl");
const SLOW = 60_000;

type Voyage = Awaited<ReturnType<typeof atFinale>>;
const finaleOf = async (l: Voyage, who: Voyage["host"]) => (await snapshot(base, l.voyage.id, who.cookie)).draw!.puzzles[2];
const turn = (l: Voyage, who: Voyage["host"], kind: string, deck: string, index: number, by: number) =>
  post(base, `/api/voyages/${l.voyage.id}/intents`, who.cookie, { seq: 0, kind, deck, index, by });
const close = (l: Voyage): void => l.streams.forEach(({ stream }) => stream.close());

it("each Deck sees only its half: the Engine Room the telegraph alone, the Wheelhouse the helm, heading, speed and the Clue", async () => {
  const l = await atFinale(base, "helm-telegraph");
  const wheelhouse = await finaleOf(l, l.host);
  const engine = await finaleOf(l, l.partner);
  expect(wheelhouse.clue).toMatch(/Heading target/);
  expect(wheelhouse.instrument!.trims).toHaveLength(1);
  expect(wheelhouse.instrument!.readings).toHaveLength(2);
  expect(wheelhouse.instrument!.valves).toBeUndefined();
  expect(engine.clue).toBeUndefined();
  expect(engine.instrument!.valves).toHaveLength(1);
  expect(JSON.stringify(engine)).not.toMatch(/target|heading|speed|readings|trims|current|knots/i);
  close(l);
}, SLOW);

it("a second telegraph or helm dial does not exist: index 1 is a 400, each Deck turns only its own dial", async () => {
  const l = await atFinale(base, "helm-telegraph");
  expect((await turn(l, l.partner, "turn-valve", "Lower Deck", 1, 1)).status).toBe(400);
  expect((await turn(l, l.host, "turn-trim", "Upper Deck", 1, 1)).status).toBe(400);
  expect((await turn(l, l.host, "turn-valve", "Upper Deck", 0, 1)).status).toBe(409);
  expect((await turn(l, l.partner, "turn-trim", "Lower Deck", 0, 1)).status).toBe(409);
  close(l);
}, SLOW);

it("both Decks' inputs inside the same second are all applied in server order, none lost", async () => {
  const l = await atFinale(base, "helm-telegraph");
  const stop = (await finaleOf(l, l.partner)).instrument!.valves![0];
  const helm = (await finaleOf(l, l.host)).instrument!.trims![0];
  const sBy = stop >= 4 ? -1 : 1;
  const hBy = helm >= 0 ? -1 : 1;
  const sent = await Promise.all([
    ...[0, 1, 2].map(() => turn(l, l.partner, "turn-valve", "Lower Deck", 0, sBy)),
    ...[0, 1, 2].map(() => turn(l, l.host, "turn-trim", "Upper Deck", 0, hBy)),
  ]);
  expect(sent.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
  expect((await finaleOf(l, l.partner)).instrument!.valves![0]).toBe(stop + 3 * sBy);
  expect((await finaleOf(l, l.host)).instrument!.trims![0]).toBe(helm + 3 * hBy);
  close(l);
}, SLOW);

it("ten seconds in band launches the Lifeboat on both Decks, and drifting out in between resets the hold with no Strike", async () => {
  const l = await atFinale(base, "helm-telegraph");
  await steerIntoBand(base, l);
  expect((await finaleOf(l, l.host)).instrument!.holdMs).not.toBeNull();
  await new Promise((r) => setTimeout(r, 2500));
  expect((await finaleOf(l, l.host)).instrument!.holdMs).toBeGreaterThanOrEqual(2000);

  // one notch of telegraph moves the speed or the heading out of band
  const up = await turn(l, l.partner, "turn-valve", "Lower Deck", 0, 1);
  const out = up.status === 200 && (await finaleOf(l, l.host)).instrument!.holdMs === null;
  if (!out) await turn(l, l.partner, "turn-valve", "Lower Deck", 0, -1); // the answer sat at the top stop
  expect((await finaleOf(l, l.host)).instrument!.holdMs).toBeNull();
  expect((await snapshot(base, l.voyage.id, l.host.cookie)).draw!.strikes).toBe(0);
  await turn(l, l.partner, "turn-valve", "Lower Deck", 0, out ? -1 : 1);
  expect((await finaleOf(l, l.host)).instrument!.holdMs).toBeLessThan(2000);

  let shot: LobbySnapshot | undefined;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    shot = await snapshot(base, l.voyage.id, l.host.cookie);
    if (shot.draw!.puzzles[2].status === "solved") break;
  }
  for (const who of [l.host, l.partner]) {
    const s = await snapshot(base, l.voyage.id, who.cookie);
    expect(s.draw!.puzzles[2].status).toBe("solved");
    expect(s.draw!.strikes).toBe(0);
    expect(s.end?.outcome).toBe("launched");
  }
  close(l);
}, SLOW);

it("a lock-in off target is a Strike, and a typed answer is a 409", async () => {
  const l = await atFinale(base, "helm-telegraph");
  expect((await intent(base, l.voyage.id, l.host, { kind: "lock-in", deck: "Upper Deck" })).status).toBe(200);
  expect((await snapshot(base, l.voyage.id, l.host.cookie)).draw!.strikes).toBe(1);
  expect((await intent(base, l.voyage.id, l.partner, { kind: "submit", deck: "Lower Deck", slot: "finale", answer: "1234" })).status).toBe(409);
  close(l);
}, SLOW);
