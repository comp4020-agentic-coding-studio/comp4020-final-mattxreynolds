import type { DatabaseSync } from "node:sqlite";
import type { Person } from "./people.ts";
import type { VoyageSummary } from "./voyages.ts";
import { DECKS } from "../shared/intents.ts";
import type { Notice } from "../shared/draw.ts";
import type { LobbySnapshot, ProfileVoyages } from "../shared/lobby.ts";
import { publicDraw } from "./draw.ts";
import { clockView, settleClock } from "./clock.ts";
import { isFrozen } from "./presence.ts";
import { endCard } from "./debrief.ts";
import { offerFor } from "./leaderboard.ts";
import { draftsOf, poseOf } from "./low-trust.ts";

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

export function isEnded(db: DatabaseSync, voyageId: string): boolean {
  return (db.prepare("SELECT outcome FROM voyage WHERE id = ?").get(voyageId) as { outcome: string | null }).outcome !== null;
}

/** Every Voyage the Person is seated in, newest first, split by whether it has finished. Nothing expires. */
export function voyagesOf(db: DatabaseSync, personId: string): ProfileVoyages {
  const rows = db
    .prepare(
      "SELECT v.id, v.code, v.link_key, v.ship_name, v.outcome FROM voyage v JOIN voyage_person vp ON vp.voyage_id = v.id WHERE vp.person_id = ? ORDER BY v.created_at DESC, v.id",
    )
    .all(personId) as { id: string; code: string; link_key: string; ship_name: string; outcome: "abandoned" | "launched" | "sank" | null }[];
  const listings = rows.map((r) => ({ id: r.id, ship: r.ship_name, link: `/v/${r.link_key}`, code: r.code, outcome: r.outcome }));
  return { unfinished: listings.filter((v) => v.outcome === null), finished: listings.filter((v) => v.outcome !== null) };
}

export function voyageSeq(db: DatabaseSync, voyageId: string): number {
  return (db.prepare("SELECT seq FROM voyage WHERE id = ?").get(voyageId) as { seq: number }).seq;
}

/** The Voyage starts only once both Players hold a Deck and have pressed "Cast off". */
export function hasStarted(seats: Seat[]): boolean {
  return seats.length === 2 && seats.every((s) => s.deck !== null && s.cast_off === 1);
}

export function snapshotFor(db: DatabaseSync, voyage: VoyageSummary, you: Person): Snapshot {
  const now = Date.now();
  if (settleClock(db, voyage.id, now)) queueMicrotask(() => publish(voyage.id)); // due and nobody has looked yet: tell the other Deck too
  const seats = seatsOf(db, voyage.id);
  const yourDeck = seats.find((s) => s.person_id === you.id)?.deck ?? null;
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
    yourDeck,
    seq: voyageSeq(db, voyage.id),
    started: hasStarted(seats),
    draw: yourDeck ? publicDraw(db, voyage.id, yourDeck) : null,
    clock: clockView(db, voyage.id, now),
    paused: isFrozen(db, voyage.id),
    ended: isEnded(db, voyage.id),
    end: endCard(db, voyage.id),
    post: offerFor(db, voyage.id, you.id),
    pose: poseOf(db, voyage.id, you.id),
    drafts: draftsOf(db, voyage.id, you.id),
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
const listeners = new Map<string, Set<(notice?: Notice) => void>>();

export function subscribe(voyageId: string, listener: (notice?: Notice) => void): () => void {
  let set = listeners.get(voyageId);
  if (!set) listeners.set(voyageId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(voyageId);
  };
}

/** Every open stream sends a fresh snapshot, then the notice if there is one (the same to both Decks). */
export function publish(voyageId: string, notice?: Notice): void {
  for (const listener of listeners.get(voyageId) ?? []) listener(notice);
}
