import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PublicDraw, Slot } from "../shared/draw.ts";
import type { DeckName } from "../shared/intents.ts";
import { puzzle, puzzleId, registeredIds } from "../server/puzzles/index.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { type SseStream, openSse, parseFrame } from "./helpers/sse.ts";
import { type Sailor, guest, intent, post, snapshot, underway } from "./helpers/voyage.ts";

// Every Puzzle in the registry, visited while it is live in a real Voyage, so a
// Puzzle added to the registry is covered with no edit here. Two things must
// hold for each one and both Decks:
//   - secrecy (ADR 0007): nothing sent to a Player holds the other Deck's Clue
//     data or any answer, and a Person who is not seated gets nothing;
//   - refusals (#11): a 409 is never a Strike, moves nothing, and both Decks
//     still show the same Voyage afterwards.
// The Draw picks Puzzles at random, so this plays fresh Voyages until each
// Puzzle id has been seen. It runs on a second server so it can read the stored
// Draw back to learn which Puzzle is where; it never reads an answer.
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

const SLOTS: Slot[] = ["opener", "middle", "finale"];

function keysOf(voyageId: string): string[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const row = db.prepare("SELECT draw FROM voyage WHERE id = ?").get(voyageId) as { draw: string };
  db.close();
  return (JSON.parse(row.draw) as { puzzles: { key: string }[] }).puzzles.map((p) => p.key);
}

// the wire's own field names for a Puzzle's stored data and answer
const STORED_FIELDS = /"(answer|data|path|panels|wires|direction)"/;
const lines = (clue: string): string[] => clue.split("\n").map((l) => l.trim()).filter((l) => l.length >= 6);

it("no payload or SSE event to a Player holds the other Deck's Clue data or any answer, for every Puzzle and both Decks; a non-seated Person receives nothing", async () => {
  const left = new Set(registeredIds());
  const stranger = await guest(server.url);
  for (let n = 0; n < 80 && left.size > 0; n++) {
    const { voyage, host, partner } = await underway(server.url);
    const keys = keysOf(voyage.id);
    if (!keys.some((k) => left.has(puzzleId(k)))) continue; // nothing new in this Draw
    const sailors: Record<DeckName, Sailor> = { "Upper Deck": host, "Lower Deck": partner };
    // what each Deck was sent, in any form: frames from a stream held open all Voyage, fresh snapshots, error bodies
    const sent: Record<DeckName, string[]> = { "Upper Deck": [], "Lower Deck": [] };
    const streams = {} as Record<DeckName, SseStream>;
    for (const deck of ["Upper Deck", "Lower Deck"] as const) {
      const opened = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), sailors[deck].cookie);
      expect(opened.status).toBe(200);
      streams[deck] = opened.stream;
      sent[deck].push(await opened.stream.next());
    }
    const clues: { slot: Slot; holder: DeckName; text: string; answer: string | null }[] = [];

    for (const [index, slot] of SLOTS.entries()) {
      const version = puzzle(keys[index]);
      const { clue: clueDeck, lock: lockDeck } = version.decks;
      const view = async (deck: DeckName): Promise<PublicDraw> => {
        const snap = await snapshot(server.url, voyage.id, sailors[deck].cookie);
        sent[deck].push(JSON.stringify(snap));
        return snap.draw!;
      };
      if (index > 0) await view(clueDeck); // the Puzzle is live now: take both Decks' fresh views
      const clue = (await view(clueDeck)).puzzles[index].clue!;
      await view(lockDeck);
      const typed = !version.walk && !version.instrument;
      clues.push({ slot, holder: clueDeck, text: clue, answer: typed ? codeFromClue(clue) : null });
      left.delete(puzzleId(keys[index]));
      if (index === 2) break;
      // solve it from the Clue text alone, so the next Puzzle goes live
      if (version.walk) {
        for (const dir of routes(parsePlan(clue))[0]) await intent(server.url, voyage.id, sailors[lockDeck], { kind: "walk-step", deck: lockDeck, slot, dir });
      } else {
        await intent(server.url, voyage.id, sailors[lockDeck], { kind: "submit", deck: lockDeck, slot, answer: codeFromClue(clue) });
      }
      // the bell comes after the snapshot it belongs to, so reading to it takes in every frame the solve sent
      for (const deck of ["Upper Deck", "Lower Deck"] as const) {
        for (let frame = parseFrame(await streams[deck].next(10_000)); ; frame = parseFrame(await streams[deck].next(10_000))) {
          sent[deck].push(JSON.stringify(frame.data));
          if (frame.event === "bell") break;
        }
      }
    }
    for (const stream of Object.values(streams)) stream.close();

    for (const deck of ["Upper Deck", "Lower Deck"] as const) {
      const all = sent[deck].join("\n");
      expect(STORED_FIELDS.exec(all)?.[0], `${deck} payload carries a stored Puzzle field`).toBeUndefined();
      for (const c of clues) {
        if (c.holder !== deck) for (const line of lines(c.text)) expect(all, `${deck} was sent ${c.slot}'s Clue: ${line}`).not.toContain(line);
        if (c.answer) expect(all, `${deck} was sent ${c.slot}'s answer`).not.toContain(`"${c.answer}"`);
      }
    }

    // a Person who is not seated: nothing, in any of the ways to ask
    const blind = [
      await fetch(new URL(`/api/voyages/${voyage.id}/events`, server.url), { headers: { cookie: stranger.cookie } }),
      await fetch(new URL(`/api/voyages/${voyage.id}/debrief`, server.url), { headers: { cookie: stranger.cookie } }),
      await post(server.url, `/api/voyages/${voyage.id}/intents`, stranger.cookie, { kind: "submit", seq: 0, deck: "Lower Deck", slot: "opener", answer: "0000" }),
    ];
    for (const res of blind) {
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).not.toMatch(STORED_FIELDS);
      for (const c of clues) {
        for (const line of lines(c.text)) expect(body).not.toContain(line);
        if (c.answer) expect(body).not.toContain(c.answer);
      }
    }
    expect((await fetch(new URL(`/api/voyages/${voyage.id}/events`, server.url))).status).toBe(401);
  }
  expect([...left], "Puzzle ids never drawn").toEqual([]);
}, 180_000);

it("a 409 is never a Strike, moves nothing and leaves both Decks showing the same Voyage, at every Puzzle's refusal path", async () => {
  const left = new Set(registeredIds());
  for (let n = 0; n < 80 && left.size > 0; n++) {
    const { voyage, host, partner } = await underway(server.url);
    const keys = keysOf(voyage.id);
    if (!keys.some((k) => left.has(puzzleId(k)))) continue;
    const sailors: Record<DeckName, Sailor> = { "Upper Deck": host, "Lower Deck": partner };
    const views = async () => {
      const [a, b] = await Promise.all([host, partner].map((who) => snapshot(server.url, voyage.id, who.cookie)));
      return { a, b };
    };
    // both Decks agree on the Voyage: same sequence number, Strikes and Puzzle statuses
    const converged = async (strikes: number, seq: number, context: string): Promise<void> => {
      const { a, b } = await views();
      expect(a.seq, `${context}: seq`).toBe(seq);
      expect(b.seq, `${context}: seq`).toBe(seq);
      expect(a.draw!.strikes, `${context}: Strikes`).toBe(strikes);
      expect(b.draw!.strikes, `${context}: Strikes`).toBe(strikes);
      expect(a.draw!.puzzles.map((p) => p.status), context).toEqual(b.draw!.puzzles.map((p) => p.status));
    };
    const streams = await Promise.all([host, partner].map((who) => openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), who.cookie)));

    for (const [index, slot] of SLOTS.entries()) {
      const version = puzzle(keys[index]);
      const { clue: clueDeck, lock: lockDeck } = version.decks;
      const here = `${keys[index]} (${slot})`;
      const seq = (await views()).a.seq;
      const attempts: [string, Response][] = [];
      const send = async (who: DeckName, body: Record<string, unknown>, withSeq: number = seq): Promise<Response> =>
        post(server.url, `/api/voyages/${voyage.id}/intents`, sailors[who].cookie, { seq: withSeq, ...body });
      const answerFrom = async (): Promise<string> => (await snapshot(server.url, voyage.id, sailors[clueDeck].cookie)).draw!.puzzles[index].clue!;

      // the Clue Deck holds no lock for this Puzzle
      attempts.push(["clue Deck submits", await send(clueDeck, { kind: "submit", deck: clueDeck, slot, answer: "0000" })]);
      if (version.walk) attempts.push(["clue Deck steps", await send(clueDeck, { kind: "walk-step", deck: clueDeck, slot, dir: "north" })]);
      // a stale seq, from the Deck that does hold the lock
      attempts.push([
        "stale seq",
        await send(lockDeck, version.walk ? { kind: "walk-step", deck: lockDeck, slot, dir: "north" } : { kind: "submit", deck: lockDeck, slot, answer: "0000" }, seq + 7),
      ]);
      // a station that is not live yet is dead
      if (index < 2) {
        const next = puzzle(keys[index + 1]);
        attempts.push(["dead station", await send(next.decks.lock, { kind: "submit", deck: next.decks.lock, slot: SLOTS[index + 1], answer: "0000" })]);
        attempts.push(["dead instrument", await send("Upper Deck", { kind: "lock-in", deck: "Upper Deck" })]);
      }
      if (version.instrument || version.walk) attempts.push(["typed answer to a worked station", await send(lockDeck, { kind: "submit", deck: lockDeck, slot, answer: "0000" })]);
      for (const [what, res] of attempts) expect(res.status, `${here}: ${what}`).toBe(409);
      await converged(0, seq, `${here} after refusals`);

      if (index === 2) break;
      const clue = await answerFrom();
      if (version.walk) {
        for (const dir of routes(parsePlan(clue))[0]) await intent(server.url, voyage.id, sailors[lockDeck], { kind: "walk-step", deck: lockDeck, slot, dir });
      } else {
        await intent(server.url, voyage.id, sailors[lockDeck], { kind: "submit", deck: lockDeck, slot, answer: codeFromClue(clue) });
      }
      left.delete(puzzleId(keys[index]));
      const solvedAt = (await views()).a.seq;
      // solved already: sending it again is a 409 too
      const again = await post(server.url, `/api/voyages/${voyage.id}/intents`, sailors[lockDeck].cookie, version.walk
        ? { seq: solvedAt, kind: "walk-step", deck: lockDeck, slot, dir: "north" }
        : { seq: solvedAt, kind: "submit", deck: lockDeck, slot, answer: "0000" });
      expect(again.status, `${here}: already solved`).toBe(409);
      await converged(0, solvedAt, `${here} after solving`);
    }
    left.delete(puzzleId(keys[2]));
    for (const { stream } of streams) stream.close();
  }
  expect([...left], "Puzzle ids never drawn").toEqual([]);
}, 180_000);
