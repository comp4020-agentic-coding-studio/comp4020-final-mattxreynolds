import type { DatabaseSync } from "node:sqlite";
import type { Intent } from "../shared/intents.ts";
import { launch, settleClock, type LaunchResult } from "./clock.ts";
import { liveEntry, type SubmitResult } from "./draw.ts";
import { logEvent } from "./events.ts";
import { HOLD_MS, liveOf, saveLive } from "./instrument.ts";
import { publish } from "./lobby.ts";
import { withVoyage } from "./mutex.ts";

// The finale's split instrument (#24, #48): the dials, the explicit lock-in
// and the 10 s hold that launches the Lifeboat. Drifting out resets the hold
// and is never a Strike; only a lock-in pressed off target is.

export type Dial = Extract<Intent, { kind: "turn-valve" | "turn-trim" }>;
export type FinaleIntent = Dial | Extract<Intent, { kind: "lock-in" }>;

/** Why a dial turn or lock-in cannot apply (never a Strike), or null when it can. */
export function finaleConflict(db: DatabaseSync, voyageId: string, intent: FinaleIntent): { status: 409 | 400; reason: string; message: string } | null {
  const live = liveEntry(db, voyageId);
  if (!live?.version.instrument) return { status: 409, reason: "station dead", message: "the instrument is dead until the one before it is solved" };
  if (intent.kind === "lock-in") return null;
  const gauges = live.version.instrument.initial(live.data).valves.length;
  if (intent.index >= gauges) return { status: 400, reason: "bad body", message: "that is not a valid intent" };
  // the Engine Room (the lock Deck) turns valves; the Wheelhouse (the clue Deck) sets trims
  const own = intent.kind === "turn-valve" ? live.version.decks.lock : live.version.decks.clue;
  if (intent.deck !== own) return { status: 409, reason: "not your dial", message: "nothing on this Deck turns that" };
  return null;
}

/** Applies one dial turn, clamped to the dial's range. True when the dial moved. */
export function turnDial(db: DatabaseSync, voyageId: string, intent: Dial, now: number): boolean {
  const { version, data } = liveEntry(db, voyageId)!;
  const inst = version.instrument!;
  const live = liveOf(db, voyageId, version, data);
  const [dial, range] = intent.kind === "turn-valve" ? [live.valves, inst.limits.valves] : [live.trims, inst.limits.trims];
  const next = Math.max(range[0], Math.min(range[1], dial[intent.index] + intent.by));
  if (next === dial[intent.index]) return false;
  dial[intent.index] = next;
  // entering band starts the hold; staying in keeps it; leaving resets it, with no Strike
  live.since = inst.inBand(data, live) ? (live.since ?? now) : null;
  saveLive(db, voyageId, live);
  return true;
}

/** An explicit lock-in: on target nothing happens (the hold launches), off target it is a Strike. */
export function lockIn(db: DatabaseSync, voyageId: string, now: number): SubmitResult | undefined {
  const { version, data } = liveEntry(db, voyageId)!;
  if (version.instrument!.inBand(data, liveOf(db, voyageId, version, data))) return undefined;
  const { strikes } = db.prepare("SELECT strikes FROM voyage WHERE id = ?").get(voyageId) as { strikes: number };
  db.prepare("UPDATE voyage SET strikes = strikes + 1 WHERE id = ?").run(voyageId);
  settleClock(db, voyageId, now);
  return { kind: "strike", strikes: strikes + 1 };
}

/**
 * Launches if the gauges have held for 10 s, taking the launch moment as the
 * end of the hold, not whenever the server noticed. Compared lazily, like the Clock.
 * The caller holds the Voyage's mutex.
 */
export function settleFinale(db: DatabaseSync, voyageId: string, now: number): LaunchResult | null {
  const live = liveEntry(db, voyageId);
  if (!live?.version.instrument) return null;
  const { since } = liveOf(db, voyageId, live.version, live.data);
  if (since === null || now - since < HOLD_MS) return null;
  db.exec("BEGIN IMMEDIATE");
  const result = launch(db, voyageId, since + HOLD_MS);
  if (result.kind === "launched") {
    db.prepare("UPDATE voyage SET solved = solved + 1, seq = seq + 1 WHERE id = ?").run(voyageId);
    logEvent(db, { voyageId, action: "puzzle.solved", detail: { slot: live.slot } });
  }
  db.exec("COMMIT");
  return result;
}

/** Nothing ticks, so a turn arms one look-again for when a hold begun now would be complete. */
export function armFinale(db: DatabaseSync, voyageId: string, afterMs = HOLD_MS): void {
  setTimeout(() => {
    void withVoyage(voyageId, () => settleFinale(db, voyageId, Date.now())).then((result) => {
      if (result?.kind === "launched") publish(voyageId, { event: "bell", data: { slot: "finale" } });
      else if (result) publish(voyageId);
    });
  }, afterMs + 50).unref();
}

/** After a restart: any hold that was running when the server stopped is looked at again. */
export function rearmFinales(db: DatabaseSync): void {
  const rows = db.prepare("SELECT i.voyage_id, i.in_band_since FROM instrument i JOIN voyage v ON v.id = i.voyage_id WHERE i.in_band_since IS NOT NULL AND v.outcome IS NULL").all() as {
    voyage_id: string;
    in_band_since: number;
  }[];
  for (const r of rows) armFinale(db, r.voyage_id, Math.max(0, r.in_band_since + HOLD_MS - Date.now()));
}
