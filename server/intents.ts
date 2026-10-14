import type { DatabaseSync } from "node:sqlite";
import { DECKS, intentSchema, type DeckName, type Intent } from "../shared/intents.ts";
import { hasStarted, seatsOf, voyageById, voyageSeq } from "./lobby.ts";
import type { Person } from "./people.ts";

export type Outcome =
  | { ok: true; changed: boolean; started: boolean }
  | { ok: false; status: 403 | 409 | 400; reason: string; message: string; offer?: DeckName };

const refuse = (status: 403 | 409 | 400, reason: string, message: string, offer?: DeckName): Outcome => ({
  ok: false,
  status,
  reason,
  message,
  offer,
});

const record = (raw: unknown): Record<string, unknown> => (typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});

/**
 * Checks one intent in the refusal order and applies it (#11, ADR 0005):
 * 403 not seated, 403 not your Deck, 409 stale or conflicting, 400 bad body.
 * The caller has already ruled out 401 and holds the Voyage's mutex, so
 * everything here is one synchronous transaction with no await in it.
 */
export function applyIntent(db: DatabaseSync, voyageId: string, you: Person, raw: unknown): Outcome {
  if (!voyageById(db, voyageId)) return refuse(403, "not seated", "not seated in this Voyage");
  const seats = seatsOf(db, voyageId);
  const mine = seats.find((s) => s.person_id === you.id);
  // 403 for a Voyage that doesn't exist too, so ids can't be probed
  if (!mine) return refuse(403, "not seated", "not seated in this Voyage");

  const body = record(raw);
  if (typeof body.deck === "string" && body.kind !== "choose-deck" && body.deck !== mine.deck) {
    return refuse(403, "not your Deck", "that is not your Deck");
  }

  const parsed = intentSchema.safeParse(raw);
  if (parsed.success) {
    const conflict = conflictWith(parsed.data, mine, seats);
    if (conflict) return conflict;
  }
  if (typeof body.seq === "number" && body.seq !== voyageSeq(db, voyageId)) {
    return refuse(409, "stale", "the ship shifted, try again");
  }
  if (!parsed.success) return refuse(400, "bad body", "that is not a valid intent");

  const intent = parsed.data;
  if (intent.kind === "choose-deck" && mine.deck === intent.deck) {
    return { ok: true, changed: false, started: hasStarted(seats) };
  }
  db.exec("BEGIN IMMEDIATE");
  if (intent.kind === "choose-deck") {
    db.prepare("UPDATE voyage_person SET deck = ? WHERE voyage_id = ? AND person_id = ?").run(intent.deck, voyageId, you.id);
  } else {
    db.prepare("UPDATE voyage_person SET cast_off = 1 WHERE voyage_id = ? AND person_id = ?").run(voyageId, you.id);
  }
  db.prepare("UPDATE voyage SET seq = seq + 1 WHERE id = ?").run(voyageId);
  db.exec("COMMIT");
  return { ok: true, changed: true, started: hasStarted(seatsOf(db, voyageId)) };
}

function conflictWith(intent: Intent, mine: { deck: DeckName | null; cast_off: number }, seats: { person_id: string; deck: DeckName | null }[]): Outcome | null {
  if (intent.kind === "choose-deck") {
    if (mine.cast_off === 1) return refuse(409, "already cast off", "you have already cast off");
    const holder = seats.find((s) => s.deck === intent.deck);
    if (holder && mine.deck !== intent.deck) {
      const other = DECKS.find((d) => d !== intent.deck)!;
      return refuse(409, "deck taken", "That Deck is taken", other);
    }
    return null;
  }
  if (mine.deck === null) return refuse(409, "no Deck chosen", "choose a Deck before casting off");
  return null;
}
