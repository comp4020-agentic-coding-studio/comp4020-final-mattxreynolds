import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { shipName, voyageCode } from "./names.ts";

export interface VoyageSummary {
  id: string;
  ship: string;
  /** Path on this origin that opens the lobby directly. */
  link: string;
  /** The Voyage code: a bearer secret, shown only to the Voyage's own Players. */
  code: string;
}

interface Row {
  id: string;
  code: string;
  link_key: string;
  ship_name: string;
}

const summary = (r: Row): VoyageSummary => ({ id: r.id, ship: r.ship_name, link: `/v/${r.link_key}`, code: r.code });

export function startVoyage(db: DatabaseSync, personId: string): VoyageSummary {
  const row: Row = {
    id: `v_${randomUUID().slice(0, 8)}`,
    code: voyageCode(),
    link_key: randomBytes(9).toString("base64url"),
    ship_name: shipName(),
  };
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  // a code collision is a 1-in-100000 draw; retry until one is free
  for (;;) {
    try {
      db.prepare("INSERT INTO voyage (id, code, link_key, ship_name, created_at) VALUES (?, ?, ?, ?, ?)").run(
        row.id, row.code, row.link_key, row.ship_name, now,
      );
      break;
    } catch (e) {
      if (!String(e).includes("UNIQUE")) {
        db.exec("ROLLBACK");
        throw e;
      }
      row.code = voyageCode();
    }
  }
  db.prepare("INSERT INTO voyage_person (voyage_id, person_id, joined_at) VALUES (?, ?, ?)").run(row.id, personId, now);
  db.exec("COMMIT");
  return summary(row);
}

export type JoinResult = { voyage: VoyageSummary; newlySeated: boolean } | "unknown" | "full";

/** Seats a Person in the Voyage named by its link key or code. Two Persons at most; seating again is a no-op. */
export function joinVoyage(db: DatabaseSync, personId: string, by: { key?: string; code?: string }): JoinResult {
  const row = (
    by.key
      ? db.prepare("SELECT * FROM voyage WHERE link_key = ?").get(by.key)
      : by.code
        ? db.prepare("SELECT * FROM voyage WHERE code = ?").get(by.code.trim().toUpperCase())
        : undefined
  ) as Row | undefined;
  if (!row) return "unknown";
  db.exec("BEGIN IMMEDIATE");
  const seated = db.prepare("SELECT person_id FROM voyage_person WHERE voyage_id = ?").all(row.id) as { person_id: string }[];
  if (seated.some((s) => s.person_id === personId)) {
    db.exec("COMMIT");
    return { voyage: summary(row), newlySeated: false };
  }
  if (seated.length >= 2) {
    db.exec("ROLLBACK");
    return "full";
  }
  db.prepare("INSERT INTO voyage_person (voyage_id, person_id, joined_at) VALUES (?, ?, ?)").run(row.id, personId, Date.now());
  db.exec("COMMIT");
  return { voyage: summary(row), newlySeated: true };
}
