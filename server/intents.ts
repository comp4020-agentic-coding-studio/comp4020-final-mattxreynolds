import type { DatabaseSync } from "node:sqlite";
import { DECKS, intentSchema, type DeckName, type Intent } from "../shared/intents.ts";
import { judge, storeDraw, submitConflict, type SubmitResult } from "./draw.ts";
import { settleClock } from "./clock.ts";
import { armFinale, finaleConflict, lockIn, settleFinale, turnDial } from "./finale.ts";
import { hasStarted, isEnded, publish, seatsOf, voyageById, voyageSeq } from "./lobby.ts";
import type { Person } from "./people.ts";

export type Outcome =
  | { ok: true; changed: boolean; started: boolean; ended?: boolean; result?: SubmitResult }
  | { ok: false; status: 403 | 409 | 400 | 429; reason: string; message: string; offer?: DeckName };

const refuse = (status: 403 | 409 | 400 | 429, reason: string, message: string, offer?: DeckName): Outcome => ({
  ok: false,
  status,
  reason,
  message,
  offer,
});

// About one answer per second per Puzzle per Person (#11). performance.now()
// is monotonic and real even under the fake clock, which freezes Date only.
const ANSWER_GAP_MS = 1000;
const lastAnswer = new Map<string, number>();
function throttled(voyageId: string, personId: string, slot: string): boolean {
  const k = `${voyageId}/${personId}/${slot}`;
  const now = performance.now();
  const last = lastAnswer.get(k);
  if (last !== undefined && now - last < ANSWER_GAP_MS) return true;
  lastAnswer.set(k, now);
  return false;
}

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

  // the Clock is compared lazily: a ship that is due to sink sinks as soon as anyone acts
  if (settleClock(db, voyageId, Date.now())) publish(voyageId);
  // likewise a hold that has run its ten seconds launches as soon as anyone acts
  const late = settleFinale(db, voyageId, Date.now());
  if (late?.kind === "launched") publish(voyageId, { event: "bell", data: { slot: "finale" } });
  else if (late) publish(voyageId);
  if (isEnded(db, voyageId)) return refuse(409, "voyage ended", "this Voyage has ended");

  const parsed = intentSchema.safeParse(raw);
  if (parsed.success) {
    const conflict = conflictWith(db, voyageId, parsed.data, mine, seats);
    if (conflict) return conflict;
  }
  // dial turns are exempt: both Decks turn at once, and none may be lost to a stale seq (#24)
  const isDial = body.kind === "turn-valve" || body.kind === "turn-trim";
  if (!isDial && typeof body.seq === "number" && body.seq !== voyageSeq(db, voyageId)) {
    return refuse(409, "stale", "the ship shifted, try again");
  }
  if (!parsed.success) return refuse(400, "bad body", "that is not a valid intent");

  const intent = parsed.data;
  // the throttle comes last in the refusal order, and a 429 is never a Strike (#23)
  if (intent.kind === "submit" && throttled(voyageId, you.id, intent.slot)) {
    return refuse(429, "throttled", "Easy. Give the lock a moment.");
  }
  if (intent.kind === "choose-deck" && mine.deck === intent.deck) {
    return { ok: true, changed: false, started: hasStarted(seats) };
  }
  if (intent.kind === "turn-valve" || intent.kind === "turn-trim") {
    // a dial is an overwritten row like pose, so it does not move seq
    db.exec("BEGIN IMMEDIATE");
    const moved = turnDial(db, voyageId, intent, Date.now());
    db.exec("COMMIT");
    if (moved) armFinale(db, voyageId);
    return { ok: true, changed: moved, started: true };
  }
  db.exec("BEGIN IMMEDIATE");
  let result: SubmitResult | undefined;
  if (intent.kind === "lock-in") {
    result = lockIn(db, voyageId, Date.now());
  } else if (intent.kind === "end-voyage") {
    db.prepare("UPDATE voyage SET outcome = 'abandoned', ended_at = ? WHERE id = ?").run(Date.now(), voyageId);
  } else if (intent.kind === "choose-deck") {
    db.prepare("UPDATE voyage_person SET deck = ? WHERE voyage_id = ? AND person_id = ?").run(intent.deck, voyageId, you.id);
  } else if (intent.kind === "cast-off") {
    db.prepare("UPDATE voyage_person SET cast_off = 1 WHERE voyage_id = ? AND person_id = ?").run(voyageId, you.id);
    if (hasStarted(seatsOf(db, voyageId))) {
      storeDraw(db, voyageId); // generated once, at Voyage start
      db.prepare("UPDATE voyage SET cast_off_at = ? WHERE id = ?").run(Date.now(), voyageId); // the Clock starts here
    }
  } else {
    result = judge(db, voyageId, intent.slot, intent.answer);
    if (result.kind === "strike") settleClock(db, voyageId, Date.now()); // the third Strike, or a Strike that takes the Clock to zero, sinks the ship
  }
  // every accepted intent moves seq, so the same submission sent twice is a 409 the second time
  db.prepare("UPDATE voyage SET seq = seq + 1 WHERE id = ?").run(voyageId);
  db.exec("COMMIT");
  const ended = intent.kind === "end-voyage";
  return { ok: true, changed: true, started: !ended && hasStarted(seatsOf(db, voyageId)), ended, result };
}

function conflictWith(
  db: DatabaseSync,
  voyageId: string,
  intent: Intent,
  mine: { deck: DeckName | null; cast_off: number },
  seats: { person_id: string; deck: DeckName | null }[],
): Outcome | null {
  if (intent.kind === "end-voyage") return null;
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
  if (intent.kind === "submit") {
    const why = submitConflict(db, voyageId, intent.deck, intent.slot);
    return why ? refuse(409, why.reason, why.message) : null;
  }
  if (intent.kind === "turn-valve" || intent.kind === "turn-trim" || intent.kind === "lock-in") {
    const why = finaleConflict(db, voyageId, intent);
    return why ? refuse(why.status, why.reason, why.message) : null;
  }
  return null;
}
