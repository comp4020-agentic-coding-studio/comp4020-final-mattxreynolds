import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SLOTS, type PublicDraw, type PublicPuzzle, type Slot } from "../shared/draw.ts";
import type { DeckName, WalkDir } from "../shared/intents.ts";
import { puzzle, versionsFor } from "./puzzles/index.ts";
import { instrumentView } from "./instrument.ts";
import type { Pos, PuzzleVersion, Rng } from "./puzzles/types.ts";

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
    // a plain random pick among the slot's Puzzles; the freshness rule for a known Team is #65's
    const options = versionsFor(slot);
    if (options.length === 0) continue;
    const version = options[Math.floor(rng() * options.length)];
    puzzles.push({ slot, key: version.key, data: version.generate(rng) });
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
  walk_pos: string | null;
}

const rowOf = (db: DatabaseSync, voyageId: string): Row =>
  db.prepare("SELECT draw, solved, strikes, walk_pos FROM voyage WHERE id = ?").get(voyageId) as unknown as Row;

/** Where the Walker stands now: the stored tile, or the Puzzle's start. */
const walkerAt = (row: Row, start: Pos): Pos => (row.walk_pos ? (JSON.parse(row.walk_pos) as Pos) : start);

export function loadDraw(raw: string): StoredDraw {
  const draw = storedDrawSchema.parse(JSON.parse(raw));
  for (const p of draw.puzzles) puzzle(p.key).schema.parse(p.data); // an unreadable Puzzle fails loudly, not silently
  return draw;
}

/**
 * The live Puzzle: the first present one not yet solved. A slot with no Puzzle
 * is absent, not a gap, so the next present Puzzle goes live once the one
 * before it is solved.
 */
export function liveEntry(db: DatabaseSync, voyageId: string): { slot: Slot; version: PuzzleVersion; data: unknown } | null {
  const row = rowOf(db, voyageId);
  if (!row.draw) return null;
  const entry = loadDraw(row.draw).puzzles[row.solved];
  return entry ? { slot: entry.slot, version: puzzle(entry.key), data: entry.data } : null;
}

/** What one Deck may see: its own role in each slot, its Clue text if it holds it, and never an answer. */
export function publicDraw(db: DatabaseSync, voyageId: string, deck: DeckName): PublicDraw | null {
  const row = rowOf(db, voyageId);
  if (!row.draw) return null;
  const stored = loadDraw(row.draw);
  const now = Date.now();
  const puzzles: PublicPuzzle[] = SLOTS.map((slot) => {
    const index = stored.puzzles.findIndex((p) => p.slot === slot);
    if (index === -1) return { slot, status: "dead", role: null };
    const entry = stored.puzzles[index];
    const version = puzzle(entry.key);
    const status = index < row.solved ? "solved" : index === row.solved ? "live" : "dead";
    const role = version.decks.clue === deck ? "clue" : "lock";
    const showClue = role === "clue" && status !== "dead";
    const walk = role === "lock" && status === "live" ? version.walk : undefined;
    // a split instrument's dials are live state, so only the live finale carries them
    const dials = status === "live" && version.instrument ? { instrument: instrumentView(db, voyageId, version, entry.data, role, now) } : {};
    return {
      slot,
      status,
      role,
      ...(role === "lock" && version.control ? { control: version.control } : {}),
      ...(showClue ? { clue: version.clue(entry.data) } : {}),
      ...(walk ? { walk: walk.view(entry.data, walkerAt(row, walk.start(entry.data))) } : {}),
      ...dials,
    };
  });
  return { deck, puzzles, strikes: row.strikes };
}

export type SubmitResult =
  | { kind: "solved"; slot: Slot }
  | { kind: "strike"; strikes: number }
  // a Walker's step that landed safely: the Voyage changed, nothing is announced
  | { kind: "moved" };

/** Why a submission or step cannot be judged at all (a 409, never a Strike), or null when it can. */
export function submitConflict(db: DatabaseSync, voyageId: string, deck: DeckName, slot: Slot, step?: WalkDir): { reason: string; message: string } | null {
  const row = rowOf(db, voyageId);
  if (!row.draw) return { reason: "not underway", message: "the Voyage has not started" };
  const puzzles = loadDraw(row.draw).puzzles;
  const index = puzzles.findIndex((p) => p.slot === slot);
  if (index === -1) return { reason: "no such station", message: "nothing to unlock there yet" };
  const entry = puzzles[index];
  if (index < row.solved) return { reason: "already solved", message: "that is already open" };
  if (index > row.solved) return { reason: "station dead", message: "that station is dead until the one before it is solved" };
  const version = puzzle(entry.key);
  if (version.decks.lock !== deck) return { reason: "not the lock Deck", message: "nothing on this Deck takes that answer" };
  if (version.instrument) return { reason: "no typed answer", message: "that is worked with its dials, not a code" };
  if (step === undefined && version.walk) return { reason: "no typed answer", message: "that station takes steps, not a code" };
  if (step !== undefined) {
    if (!version.walk) return { reason: "not a walking station", message: "nothing here to walk on" };
    const at = walkerAt(row, version.walk.start(entry.data));
    if (version.walk.step(entry.data, at, step).kind === "edge") return { reason: "edge of the floor", message: "there is no floor that way" };
  }
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

/** Applies one Walker's step that submitConflict has passed; a trapdoor is a Strike and returns the Walker to the start. */
export function judgeStep(db: DatabaseSync, voyageId: string, slot: Slot, dir: WalkDir): SubmitResult {
  const row = rowOf(db, voyageId);
  const entry = loadDraw(row.draw!).puzzles.find((p) => p.slot === slot)!;
  const rules = puzzle(entry.key).walk!;
  const landed = rules.step(entry.data, walkerAt(row, rules.start(entry.data)), dir);
  if (landed.kind === "far-side") {
    db.prepare("UPDATE voyage SET solved = solved + 1, walk_pos = NULL WHERE id = ?").run(voyageId);
    return { kind: "solved", slot };
  }
  db.prepare("UPDATE voyage SET walk_pos = ? WHERE id = ?").run(JSON.stringify(landed.pos), voyageId);
  if (landed.kind === "trapdoor") {
    db.prepare("UPDATE voyage SET strikes = strikes + 1 WHERE id = ?").run(voyageId);
    return { kind: "strike", strikes: row.strikes + 1 };
  }
  return { kind: "moved" };
}
