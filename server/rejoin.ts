import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DECKS } from "../shared/intents.ts";
import type { RejoinOffer } from "../shared/lobby.ts";
import { isConnected, seatsOf } from "./lobby.ts";
import type { VoyageSummary } from "./voyages.ts";

interface Found {
  voyage: VoyageSummary;
  offers: (RejoinOffer & { personId: string })[];
  /** Whether the asking Person already holds a seat here. */
  seated: boolean;
}

/** Looks a Voyage up by its code and lists the Decks whose Player isn't connected right now. */
export function offersFor(db: DatabaseSync, personId: string, code: string): Found | null {
  const r = db.prepare("SELECT id, code, link_key, ship_name FROM voyage WHERE code = ?").get(code.trim().toUpperCase()) as
    | { id: string; code: string; link_key: string; ship_name: string }
    | undefined;
  if (!r) return null;
  const seats = seatsOf(db, r.id);
  const offers = DECKS.flatMap((deck) => {
    const s = seats.find((x) => x.deck === deck);
    return s && s.person_id !== personId && !isConnected(r.id, s.person_id)
      ? [{ deck, playerName: s.name, personId: s.person_id }]
      : [];
  });
  return {
    voyage: { id: r.id, ship: r.ship_name, link: `/v/${r.link_key}`, code: r.code },
    offers,
    seated: seats.some((s) => s.person_id === personId),
  };
}

/** Points the browser's session at another Person (ADR 0002: the code is a bearer secret for this). */
export function attachSession(db: DatabaseSync, token: string, personId: string): void {
  db.prepare("UPDATE session SET person_id = ? WHERE token_hash = ?").run(
    personId,
    createHash("sha256").update(token).digest("hex"),
  );
}
