import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SLOTS, type PublicDraw, type PublicPuzzle, type Slot } from "../shared/draw.ts";
import type { DeckName } from "../shared/intents.ts";
import { currentFor, puzzle } from "./puzzles/index.ts";
import type { Rng } from "./puzzles/types.ts";

// The stored side of the Draw/PublicDraw split (ADR 0001, ADR 0007): the full
// Draw with its answers' data, written once at Voyage start and never edited.
// `data` is each Puzzle version's own shape, validated by its schema on read.
// Slots with no Puzzle yet (until their tickets land) are simply absent.
const storedDrawSchema = z.strictObject({
  puzzles: z.array(z.strictObject({ slot: z.enum(SLOTS), key: z.string(), data: z.unknown() })),
});
export type StoredDraw = z.infer<typeof storedDrawSchema>;

/** Bump when the shape of StoredDraw itself (not a Puzzle's data) changes. */
export const DRAW_VERSION = 1;

const cryptoRng: Rng = () => randomInt(2 ** 32) / 2 ** 32;

export function generateDraw(rng: Rng = cryptoRng): StoredDraw {
  const puzzles: StoredDraw["puzzles"] = [];
  for (const slot of SLOTS) {
    const version = currentFor(slot);
    if (version) puzzles.push({ slot, key: version.key, data: version.generate(rng) });
  }
  return { puzzles };
}

/** Writes the Draw once; a Voyage that already has one keeps it. */
export function storeDraw(db: DatabaseSync, voyageId: string): void {
  db.prepare("UPDATE voyage SET draw = ?, draw_version = ? WHERE id = ? AND draw IS NULL").run(
    JSON.stringify(generateDraw()),
    DRAW_VERSION,
    voyageId,
  );
}

interface Row {
  draw: string | null;
  solved: number;
  strikes: number;
}

const rowOf = (db: DatabaseSync, voyageId: string): Row =>
  db.prepare("SELECT draw, solved, strikes FROM voyage WHERE id = ?").get(voyageId) as unknown as Row;

export function loadDraw(raw: string): StoredDraw {
  const draw = storedDrawSchema.parse(JSON.parse(raw));
  for (const p of draw.puzzles) puzzle(p.key).schema.parse(p.data); // an unreadable Puzzle fails loudly, not silently
  return draw;
}

/** What one Deck may see: its own role in each slot, its Clue text if it holds it, and never an answer. */
export function publicDraw(db: DatabaseSync, voyageId: string, deck: DeckName): PublicDraw | null {
  const row = rowOf(db, voyageId);
  if (!row.draw) return null;
  const stored = loadDraw(row.draw);
  const puzzles: PublicPuzzle[] = SLOTS.map((slot, index) => {
    const entry = stored.puzzles.find((p) => p.slot === slot);
    if (!entry) return { slot, status: "dead", role: null };
    const version = puzzle(entry.key);
    const status = index < row.solved ? "solved" : index === row.solved ? "live" : "dead";
    const role = version.decks.clue === deck ? "clue" : "lock";
    const showClue = role === "clue" && status !== "dead";
    return { slot, status, role, ...(showClue ? { clue: version.clue(entry.data) } : {}) };
  });
  return { deck, puzzles, strikes: row.strikes };
}

export type SubmitResult =
  | { kind: "solved"; slot: Slot }
  | { kind: "strike"; strikes: number };

/** Why a submission cannot be judged at all (a 409, never a Strike), or null when it can. */
export function submitConflict(db: DatabaseSync, voyageId: string, deck: DeckName, slot: Slot): { reason: string; message: string } | null {
  const row = rowOf(db, voyageId);
  if (!row.draw) return { reason: "not underway", message: "the Voyage has not started" };
  const entry = loadDraw(row.draw).puzzles.find((p) => p.slot === slot);
  if (!entry) return { reason: "no such station", message: "nothing to unlock there yet" };
  if (SLOTS.indexOf(slot) < row.solved) return { reason: "already solved", message: "that is already open" };
  if (SLOTS.indexOf(slot) > row.solved) return { reason: "station dead", message: "that station is dead until the one before it is solved" };
  if (puzzle(entry.key).decks.lock !== deck) return { reason: "not the lock Deck", message: "nothing on this Deck takes that answer" };
  return null;
}

/** Judges one submission and records the result in the same transaction the caller holds. */
export function judge(db: DatabaseSync, voyageId: string, slot: Slot, answer: string): SubmitResult {
  const row = rowOf(db, voyageId);
  const entry = loadDraw(row.draw!).puzzles.find((p) => p.slot === slot)!;
  const version = puzzle(entry.key);
  if (version.check(entry.data, answer)) {
    db.prepare("UPDATE voyage SET solved = solved + 1 WHERE id = ?").run(voyageId);
    return { kind: "solved", slot };
  }
  db.prepare("UPDATE voyage SET strikes = strikes + 1 WHERE id = ?").run(voyageId);
  return { kind: "strike", strikes: row.strikes + 1 };
}
