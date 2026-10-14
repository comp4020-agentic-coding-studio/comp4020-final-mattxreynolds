import type { DatabaseSync } from "node:sqlite";
import type { Banner } from "../shared/lobby.ts";
import { isEnded, seatedPlayers, voyageById } from "./lobby.ts";
import { joinVoyage, startVoyage } from "./voyages.ts";
import type { VoyageSummary } from "./voyages.ts";

// "Sail again with <partner>" (#61). The first Player to tap opens the new
// lobby and the banner goes to the partner; the partner's own tap (or the
// banner) seats them in that same Voyage, never a second one.

export type SailAgainResult = { voyage: VoyageSummary; opened: boolean } | "not seated" | "live" | "full";

export function sailAgain(db: DatabaseSync, personId: string, fromVoyageId: string): SailAgainResult {
  const from = voyageById(db, fromVoyageId);
  if (!from || !seatedPlayers(db, from.id).some((p) => p.id === personId)) return "not seated";
  if (!isEnded(db, from.id)) return "live";
  const existing = db.prepare("SELECT new_voyage FROM sail_again WHERE from_voyage = ?").get(from.id) as { new_voyage: string } | undefined;
  if (existing) {
    const key = (db.prepare("SELECT link_key FROM voyage WHERE id = ?").get(existing.new_voyage) as { link_key: string }).link_key;
    const joined = joinVoyage(db, personId, { key });
    if (typeof joined === "string") return "full";
    return { voyage: joined.voyage, opened: false };
  }
  const voyage = startVoyage(db, personId);
  db.prepare("INSERT INTO sail_again (from_voyage, new_voyage, started_by) VALUES (?, ?, ?)").run(from.id, voyage.id, personId);
  return { voyage, opened: true };
}

/** The banners on a Person's profile: a partner's new Voyage from a Voyage you shared, which you have not boarded. */
export function bannersFor(db: DatabaseSync, personId: string): Banner[] {
  const rows = db
    .prepare(
      `SELECT s.new_voyage, p.name AS from_name FROM sail_again s
       JOIN voyage_person me ON me.voyage_id = s.from_voyage AND me.person_id = ?
       JOIN person p ON p.id = s.started_by
       WHERE s.started_by != ?
         AND NOT EXISTS (SELECT 1 FROM voyage_person vp WHERE vp.voyage_id = s.new_voyage AND vp.person_id = ?)
         AND (SELECT outcome FROM voyage WHERE id = s.new_voyage) IS NULL
       ORDER BY s.rowid DESC`,
    )
    .all(personId, personId, personId) as { new_voyage: string; from_name: string }[];
  return rows.map((r) => ({ from: r.from_name, voyage: voyageById(db, r.new_voyage)! }));
}

// Open profile streams per Person, so a banner reaches a profile that is already open.
const watchers = new Map<string, Set<() => void>>();

export function watchProfile(personId: string, listener: () => void): () => void {
  let set = watchers.get(personId);
  if (!set) watchers.set(personId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) watchers.delete(personId);
  };
}

export function publishProfile(personId: string): void {
  for (const listener of watchers.get(personId) ?? []) listener();
}
