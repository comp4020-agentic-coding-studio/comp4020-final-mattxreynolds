import type { DatabaseSync } from "node:sqlite";
import { clockLeftMs } from "./clock.ts";
import { logEvent } from "./events.ts";
import { liveEntry } from "./draw.ts";
import { armFinale, settleFinale } from "./finale.ts";
import { liveOf, saveLive } from "./instrument.ts";
import { isConnected, isEnded, publish, seatsOf } from "./lobby.ts";
import { withVoyage } from "./mutex.ts";

// Away (#56, #31): a Player whose stream has stayed closed for 8 s is Away, and
// while either Player is Away the Voyage is frozen. Nothing ticks: a freeze is
// two stored facts (when it began, and the frozen time already given back), and
// the Clock reads them lazily like everything else.
export const AWAY_MS = 8000;

/** Stops the Clock and resets the finale hold. False when there is nothing to freeze. */
export function freezeVoyage(db: DatabaseSync, voyageId: string, at: number): boolean {
  const row = db.prepare("SELECT cast_off_at, froze_at, outcome FROM voyage WHERE id = ?").get(voyageId) as
    | { cast_off_at: number | null; froze_at: number | null; outcome: string | null }
    | undefined;
  if (!row || row.cast_off_at === null || row.froze_at !== null || row.outcome !== null) return false;
  const left = clockLeftMs(db, voyageId, at) ?? 0;
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE voyage SET froze_at = ? WHERE id = ?").run(at, voyageId);
  db.prepare("UPDATE instrument SET in_band_since = NULL WHERE voyage_id = ?").run(voyageId);
  db.exec("COMMIT");
  logEvent(db, { voyageId, at, action: "voyage.frozen", detail: { left_s: Math.floor(left / 1000) } });
  return true;
}

/** Starts the Clock again, giving back the time spent frozen. False when it was not frozen. */
export function resumeVoyage(db: DatabaseSync, voyageId: string, at: number): boolean {
  const row = db.prepare("SELECT froze_at FROM voyage WHERE id = ?").get(voyageId) as { froze_at: number | null } | undefined;
  if (!row || row.froze_at === null) return false;
  db.prepare("UPDATE voyage SET paused_ms = paused_ms + ?, froze_at = NULL WHERE id = ?").run(Math.max(0, at - row.froze_at), voyageId);
  logEvent(db, { voyageId, at, action: "voyage.resumed" });
  restartHold(db, voyageId, at);
  return true;
}

/** Gauges still in band when the Voyage resumes start a fresh hold, so nobody has to nudge a dial. */
function restartHold(db: DatabaseSync, voyageId: string, at: number): void {
  const live = liveEntry(db, voyageId);
  if (!live?.version.instrument) return;
  const state = liveOf(db, voyageId, live.version, live.data);
  if (!live.version.instrument.inBand(live.data, state)) return;
  saveLive(db, voyageId, { ...state, since: at });
  armFinale(db, voyageId);
}

export function isFrozen(db: DatabaseSync, voyageId: string): boolean {
  return (db.prepare("SELECT froze_at FROM voyage WHERE id = ?").get(voyageId) as { froze_at: number | null }).froze_at !== null;
}

// When each Player's last stream closed (in grace), and who has been logged Away.
const droppedAt = new Map<string, number>();
const away = new Set<string>();
const key = (voyageId: string, personId: string): string => `${voyageId}/${personId}`;

function arm(db: DatabaseSync, voyageId: string, afterMs: number): void {
  setTimeout(() => {
    void withVoyage(voyageId, () => {
      const now = Date.now();
      if (isEnded(db, voyageId)) return false;
      const gone = seatsOf(db, voyageId).filter((s) => {
        const at = droppedAt.get(key(voyageId, s.person_id));
        return at !== undefined && !isConnected(voyageId, s.person_id) && now - at >= AWAY_MS;
      });
      if (gone.length === 0) return false;
      // a hold that finished before the Player left still launches
      settleFinale(db, voyageId, now);
      let changed = false;
      for (const s of gone) {
        const k = key(voyageId, s.person_id);
        const at = droppedAt.get(k)! + AWAY_MS;
        droppedAt.delete(k);
        away.add(k);
        logEvent(db, { voyageId, actor: s.person_id, actorName: s.name, at, action: "presence.away" });
        changed = freezeVoyage(db, voyageId, at) || changed;
      }
      return changed;
    }).then((changed) => changed && publish(voyageId));
  }, afterMs + 50).unref();
}

/** A Player's last stream closed: they are Away only if it stays closed for 8 s. */
export function playerDropped(db: DatabaseSync, voyageId: string, personId: string): void {
  droppedAt.set(key(voyageId, personId), Date.now());
  arm(db, voyageId, AWAY_MS);
}

/** A Player's stream opened: if both are back the Voyage resumes by itself. */
export function playerBack(db: DatabaseSync, voyageId: string, personId: string): void {
  const k = key(voyageId, personId);
  droppedAt.delete(k);
  void withVoyage(voyageId, () => {
    if (away.delete(k)) logEvent(db, { voyageId, actor: personId, action: "presence.back" });
    if (isEnded(db, voyageId) || !isFrozen(db, voyageId)) return false;
    if (!seatsOf(db, voyageId).every((s) => isConnected(voyageId, s.person_id))) return false;
    return resumeVoyage(db, voyageId, Date.now());
  }).then((changed) => changed && publish(voyageId));
}

/** After a restart nobody is connected: every unfinished, running Voyage gets its 8 s of grace from now. */
export function rearmPresence(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id FROM voyage WHERE cast_off_at IS NOT NULL AND outcome IS NULL AND froze_at IS NULL").all() as { id: string }[];
  for (const { id } of rows) {
    for (const s of seatsOf(db, id)) droppedAt.set(key(id, s.person_id), Date.now());
    arm(db, id, AWAY_MS);
  }
}
