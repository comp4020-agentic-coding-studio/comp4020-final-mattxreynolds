import type { DatabaseSync } from "node:sqlite";
import type { Person } from "./people.ts";
import type { VoyageSummary } from "./voyages.ts";
import { DECKS } from "../shared/intents.ts";
import type { LobbySnapshot } from "../shared/lobby.ts";

export type Snapshot = LobbySnapshot;

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

interface Seat {
  person_id: string;
  name: string;
  deck: (typeof DECKS)[number] | null;
  cast_off: number;
}

export function seatsOf(db: DatabaseSync, voyageId: string): Seat[] {
  return db
    .prepare(
      "SELECT vp.person_id, p.name, vp.deck, vp.cast_off FROM voyage_person vp JOIN person p ON p.id = vp.person_id WHERE vp.voyage_id = ? ORDER BY vp.joined_at, p.id",
    )
    .all(voyageId) as unknown as Seat[];
}

export function voyageSeq(db: DatabaseSync, voyageId: string): number {
  return (db.prepare("SELECT seq FROM voyage WHERE id = ?").get(voyageId) as { seq: number }).seq;
}

/** The Voyage starts only once both Players hold a Deck and have pressed "Cast off". */
export function hasStarted(seats: Seat[]): boolean {
  return seats.length === 2 && seats.every((s) => s.deck !== null && s.cast_off === 1);
}

export function snapshotFor(db: DatabaseSync, voyage: VoyageSummary, you: Person): Snapshot {
  const seats = seatsOf(db, voyage.id);
  return {
    voyage,
    you,
    players: seatedPlayers(db, voyage.id),
    decks: DECKS.map((deck) => {
      const holder = seats.find((s) => s.deck === deck);
      return {
        deck,
        player: holder ? { id: holder.person_id, name: holder.name } : null,
        connected: holder ? isConnected(voyage.id, holder.person_id) : false,
        castOff: holder?.cast_off === 1,
      };
    }),
    yourDeck: seats.find((s) => s.person_id === you.id)?.deck ?? null,
    seq: voyageSeq(db, voyage.id),
    started: hasStarted(seats),
  };
}

// Open streams per Person per Voyage, so a Person in two tabs is connected
// until the last one closes.
const open = new Map<string, number>();
const key = (voyageId: string, personId: string): string => `${voyageId}/${personId}`;

export function isConnected(voyageId: string, personId: string): boolean {
  return (open.get(key(voyageId, personId)) ?? 0) > 0;
}

/** Counts one more open stream and tells the Voyage; returns the call that undoes it. */
export function markConnected(voyageId: string, personId: string): () => void {
  const k = key(voyageId, personId);
  open.set(k, (open.get(k) ?? 0) + 1);
  publish(voyageId);
  return () => {
    const n = (open.get(k) ?? 1) - 1;
    if (n <= 0) open.delete(k);
    else open.set(k, n);
    publish(voyageId);
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
