import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { guestName } from "./names.ts";

export interface Person {
  id: string;
  name: string;
}

// The cookie holds a random secret; only its hash is stored, and every other
// table is keyed by the Person's public id (ADR 0002).
const hash = (token: string): string => createHash("sha256").update(token).digest("hex");

export function createGuest(db: DatabaseSync): { person: Person; token: string } {
  const person: Person = { id: `p_${randomBytes(3).toString("hex")}`, name: guestName() };
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO person (id, name, created_at) VALUES (?, ?, ?)").run(person.id, person.name, now);
  db.prepare("INSERT INTO session (token_hash, person_id, created_at) VALUES (?, ?, ?)").run(hash(token), person.id, now);
  db.exec("COMMIT");
  return { person, token };
}

export function personForToken(db: DatabaseSync, token: string | undefined): Person | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT p.id, p.name FROM session s JOIN person p ON p.id = s.person_id WHERE s.token_hash = ?")
    .get(hash(token)) as Person | undefined;
  return row ? { id: row.id, name: row.name } : null;
}
