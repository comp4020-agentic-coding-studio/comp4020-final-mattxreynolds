import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { guestName } from "./names.ts";

export interface Person {
  id: string;
  name: string;
  /** True once the Person has credentials; absent for a Guest. */
  account?: true;
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

export function renamePerson(db: DatabaseSync, id: string, name: string): void {
  db.prepare("UPDATE person SET name = ? WHERE id = ?").run(name, id);
}

export function personForToken(db: DatabaseSync, token: string | undefined): Person | null {
  if (!token) return null;
  const row = db
    .prepare(
      "SELECT p.id, p.name, a.person_id IS NOT NULL AS account FROM session s JOIN person p ON p.id = s.person_id LEFT JOIN account a ON a.person_id = p.id WHERE s.token_hash = ?",
    )
    .get(hash(token)) as { id: string; name: string; account: number } | undefined;
  return row ? { id: row.id, name: row.name, ...(row.account ? { account: true as const } : {}) } : null;
}

export function endSession(db: DatabaseSync, token: string): void {
  db.prepare("DELETE FROM session WHERE token_hash = ?").run(hash(token));
}

// Accounts (ADR 0002, #11): username and password, no email, no reset.
export const USERNAME = /^[A-Za-z0-9_-]{3,20}$/;
export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  const expected = Buffer.from(key, "hex");
  return timingSafeEqual(await derive(password, Buffer.from(salt, "hex")), expected);
}

export type UpgradeResult = { ok: true; person: Person } | { ok: false; reason: "invalid" | "taken" | "already an account" };

/** A Guest becomes an Account in place: same public id, same history. */
export async function upgradeToAccount(db: DatabaseSync, you: Person, username: unknown, password: unknown): Promise<UpgradeResult> {
  if (typeof username !== "string" || !USERNAME.test(username)) return { ok: false, reason: "invalid" };
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { ok: false, reason: "invalid" };
  if (you.account) return { ok: false, reason: "already an account" };
  const stored = await hashPassword(password);
  try {
    db.prepare("INSERT INTO account (person_id, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      you.id,
      username.toLowerCase(),
      stored,
      Date.now(),
    );
  } catch {
    const mine = db.prepare("SELECT 1 FROM account WHERE person_id = ?").get(you.id);
    return { ok: false, reason: mine ? "already an account" : "taken" };
  }
  return { ok: true, person: { id: you.id, name: you.name, account: true } };
}

// A dummy hash so an unknown username costs the same as a wrong password.
const DUMMY = await hashPassword("no such account");

/** Checks credentials and, on success, opens a new session for that browser. */
export async function signIn(db: DatabaseSync, username: unknown, password: unknown): Promise<{ person: Person; token: string } | null> {
  if (typeof username !== "string" || typeof password !== "string" || password.length > PASSWORD_MAX) return null;
  const row = db
    .prepare("SELECT p.id, p.name, a.password_hash FROM account a JOIN person p ON p.id = a.person_id WHERE a.username_key = ?")
    .get(username.toLowerCase()) as { id: string; name: string; password_hash: string } | undefined;
  const ok = await passwordMatches(password, row?.password_hash ?? DUMMY);
  if (!row || !ok) return null;
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO session (token_hash, person_id, created_at) VALUES (?, ?, ?)").run(hash(token), row.id, Date.now());
  return { person: { id: row.id, name: row.name, account: true }, token };
}

// Sign-in throttle: about 5 failed attempts a minute per username (#11).
const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(key: string): number[] {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export const signInThrottled = (username: string): boolean => recent(username.toLowerCase()).length >= MAX_FAILURES;

export function recordSignInFailure(username: string): void {
  const key = username.toLowerCase();
  failures.set(key, [...recent(key), Date.now()]);
}
