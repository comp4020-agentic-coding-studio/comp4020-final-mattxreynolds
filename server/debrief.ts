import type { DatabaseSync } from "node:sqlite";
import { SLOTS } from "../shared/draw.ts";
import { DECKS } from "../shared/intents.ts";
import type { Debrief, DebriefEntry, DebriefPuzzle, EndCard } from "../shared/lobby.ts";
import { roomForDeck } from "../shared/rooms.ts";
import { loadDraw } from "./draw.ts";
import { seatsOf } from "./lobby.ts";
import { puzzle } from "./puzzles/index.ts";

// The end card and the both-Decks debrief (#60, #10, #25). Both exist only
// once the Voyage is over. The debrief shows each Deck's Clues, never an
// answer, and is served only to the Voyage's two Players.

interface VoyageRow {
  ship_name: string;
  outcome: EndCard["outcome"] | null;
  score_ms: number | null;
  strikes: number;
  solved: number;
  draw: string | null;
}

const rowOf = (db: DatabaseSync, voyageId: string): VoyageRow =>
  db.prepare("SELECT ship_name, outcome, score_ms, strikes, solved, draw FROM voyage WHERE id = ?").get(voyageId) as unknown as VoyageRow;

const totalOf = (row: VoyageRow): number => (row.draw ? loadDraw(row.draw).puzzles.length : 0);

/** The end card's numbers, or null while the Voyage is live. Only a launch carries a Score. */
export function endCard(db: DatabaseSync, voyageId: string): EndCard | null {
  const row = rowOf(db, voyageId);
  if (!row.outcome) return null;
  return {
    outcome: row.outcome,
    scoreMs: row.outcome === "launched" ? row.score_ms : null,
    strikes: row.strikes,
    solved: row.solved,
    total: totalOf(row),
  };
}

const mmss = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function describe(action: string, detail: Record<string, unknown>): string | null {
  switch (action) {
    case "voyage.started": return "Started the Voyage";
    case "voyage.joined": return "Came aboard";
    case "intent.choose-deck": return `Took the ${String(detail.deck)}`;
    case "voyage.cast-off": return "Both Players cast off";
    case "intent.examine": return `Examined the ${String(detail.thing)}`;
    case "puzzle.solved": return `Solved the ${String(detail.slot)} Puzzle`;
    case "strike": return `Strike ${String(detail.strikes)}`;
    case "voyage.launched": return `The Lifeboat launched with ${mmss(Number(detail.score_ms))} left`;
    case "voyage.sank": return detail.reason === "clock" ? "The ship went down: the Clock ran out" : "The ship went down: three Strikes";
    case "voyage.ended": return "The Voyage was ended";
    default: return null;
  }
}

function timelineOf(db: DatabaseSync, voyageId: string): DebriefEntry[] {
  const rows = db
    .prepare("SELECT e.at, e.action, e.detail, p.name FROM event e LEFT JOIN person p ON p.id = e.actor WHERE e.voyage_id = ? ORDER BY e.id")
    .all(voyageId) as { at: number; action: string; detail: string; name: string | null }[];
  const entries: DebriefEntry[] = [];
  for (const r of rows) {
    const text = describe(r.action, JSON.parse(r.detail) as Record<string, unknown>);
    if (text) entries.push({ at: r.at, actor: r.name, text });
  }
  return entries;
}

/** Both Decks' Room, Player, Puzzles and Clues, plus the who-did-what timeline. Null while the Voyage is live. */
export function debriefOf(db: DatabaseSync, voyageId: string): Debrief | null {
  const row = rowOf(db, voyageId);
  const end = endCard(db, voyageId);
  if (!end) return null;
  const stored = row.draw ? loadDraw(row.draw) : { puzzles: [] };
  const seats = seatsOf(db, voyageId);
  return {
    ship: row.ship_name,
    end,
    decks: DECKS.map((deck) => {
      const holder = seats.find((s) => s.deck === deck);
      const puzzles: DebriefPuzzle[] = [];
      for (const slot of SLOTS) {
        const index = stored.puzzles.findIndex((p) => p.slot === slot);
        if (index === -1) continue;
        const entry = stored.puzzles[index];
        const version = puzzle(entry.key);
        const role = version.decks.clue === deck ? "clue" : "lock";
        puzzles.push({ slot, role, solved: index < row.solved, clue: role === "clue" ? version.clue(entry.data) : null });
      }
      return { deck, room: roomForDeck(deck).name, player: holder ? { name: holder.name } : null, puzzles };
    }),
    timeline: timelineOf(db, voyageId),
  };
}
