import type { DatabaseSync } from "node:sqlite";
import type { Person } from "./people.ts";
import type { VoyageSummary } from "./voyages.ts";

export interface Snapshot {
  voyage: VoyageSummary;
  you: Person;
  players: Person[];
  /** Both Decks, empty until a Player chooses one. */
  decks: { deck: "Upper Deck" | "Lower Deck"; player: string | null }[];
}

export function seatedPlayers(db: DatabaseSync, voyageId: string): Person[] {
  return db
    .prepare(
      "SELECT p.id, p.name FROM voyage_person vp JOIN person p ON p.id = vp.person_id WHERE vp.voyage_id = ? ORDER BY vp.joined_at, p.id",
    )
    .all(voyageId) as unknown as Person[];
}

export function voyageIdsFor(db: DatabaseSync, personId: string): string[] {
  const rows = db.prepare("SELECT voyage_id FROM voyage_person WHERE person_id = ?").all(personId) as { voyage_id: string }[];
  return rows.map((r) => r.voyage_id);
}

export function voyageById(db: DatabaseSync, voyageId: string): VoyageSummary | null {
  const r = db.prepare("SELECT id, code, link_key, ship_name FROM voyage WHERE id = ?").get(voyageId) as
    | { id: string; code: string; link_key: string; ship_name: string }
    | undefined;
  return r ? { id: r.id, ship: r.ship_name, link: `/v/${r.link_key}`, code: r.code } : null;
}

export function snapshotFor(db: DatabaseSync, voyage: VoyageSummary, you: Person): Snapshot {
  return {
    voyage,
    you,
    players: seatedPlayers(db, voyage.id),
    decks: [
      { deck: "Upper Deck", player: null },
      { deck: "Lower Deck", player: null },
    ],
  };
}

// Open streams per Voyage. A change calls every listener, and each one sends
// its own Person a fresh full snapshot, so SSE stays the only source of state.
const listeners = new Map<string, Set<() => void>>();

export function subscribe(voyageId: string, listener: () => void): () => void {
  let set = listeners.get(voyageId);
  if (!set) listeners.set(voyageId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(voyageId);
  };
}

export function publish(voyageId: string): void {
  for (const listener of listeners.get(voyageId) ?? []) listener();
}
