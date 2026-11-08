// SQLite persistence (ADR 003). Hand-written SQL over node:sqlite.

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Role } from "../shared/protocol.ts";
import type { Voyage } from "./game/voyage.ts";

const MIGRATIONS: string[] = [
  `CREATE TABLE voyages (
     id TEXT PRIMARY KEY,
     code TEXT NOT NULL UNIQUE,
     seed INTEGER NOT NULL,
     status TEXT NOT NULL,            -- LOBBY | ACTIVE | ENDED | ABANDONED
     phase TEXT NOT NULL,
     deepest_phase TEXT NOT NULL,
     outcome TEXT,                    -- SURVIVED | LOST
     failure_cause TEXT,
     created_at INTEGER NOT NULL,
     started_at INTEGER,
     ended_at INTEGER,
     duration_ms INTEGER,
     mistakes INTEGER NOT NULL DEFAULT 0,
     prev_code TEXT,
     state_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE seats (
     voyage_id TEXT NOT NULL REFERENCES voyages(id),
     role TEXT NOT NULL,
     callsign TEXT NOT NULL,
     token_hash TEXT NOT NULL,
     joined_at INTEGER NOT NULL,
     PRIMARY KEY (voyage_id, role)
   );
   CREATE TABLE events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     voyage_id TEXT NOT NULL REFERENCES voyages(id),
     at INTEGER NOT NULL,
     kind TEXT NOT NULL,
     detail TEXT
   );
   CREATE INDEX voyages_status ON voyages(status);
   CREATE INDEX events_voyage ON events(voyage_id);`,
  // second production cycle: modes, practice runs, crew lineage (unlocks)
  `ALTER TABLE voyages ADD COLUMN mode TEXT NOT NULL DEFAULT 'STANDARD';
   ALTER TABLE voyages ADD COLUMN practice INTEGER;
   ALTER TABLE voyages ADD COLUMN crew_id TEXT;
   ALTER TABLE voyages ADD COLUMN rerun INTEGER NOT NULL DEFAULT 0;
   UPDATE voyages SET crew_id = id WHERE crew_id IS NULL;
   CREATE INDEX voyages_crew ON voyages(crew_id);
   ALTER TABLE events ADD COLUMN seq INTEGER;`,
];

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export type HistoryRow = {
  code: string;
  status: string;
  outcome: string | null;
  failure_cause: string | null;
  deepest_phase: string;
  created_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  mistakes: number;
  mode: string;
  practice: number | null;
  rerun: number;
  engineer: string | null;
  navigator: string | null;
};

export type CrewRecord = { outcome: string | null; deepest_phase: string; mode: string; practice: number | null; rerun: number };

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  for (; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    db.exec(MIGRATIONS[version]);
    db.prepare("UPDATE schema_version SET version = ?").run(version + 1);
    db.exec("COMMIT");
  }

  const stmts = {
    insertVoyage: db.prepare(
      `INSERT INTO voyages (id, code, seed, status, phase, deepest_phase, created_at, prev_code, state_json, updated_at, crew_id, rerun)
       VALUES (?, ?, ?, 'LOBBY', 'LOBBY', 'LOBBY', ?, ?, ?, ?, ?, ?)`,
    ),
    saveVoyage: db.prepare(
      `UPDATE voyages SET status = ?, phase = ?, deepest_phase = ?, outcome = ?, failure_cause = ?,
         started_at = ?, ended_at = ?, duration_ms = ?, mistakes = ?, state_json = ?, updated_at = ?,
         mode = ?, practice = ?
       WHERE id = ?`,
    ),
    crewRecords: db.prepare(
      `SELECT outcome, deepest_phase, mode, practice, rerun FROM voyages
       WHERE crew_id = ? AND status IN ('ACTIVE', 'ENDED', 'ABANDONED') AND started_at IS NOT NULL`,
    ),
    crewOf: db.prepare("SELECT crew_id FROM voyages WHERE code = ?"),
    insertSeat: db.prepare(
      "INSERT INTO seats (voyage_id, role, callsign, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)",
    ),
    seatByToken: db.prepare("SELECT role FROM seats WHERE voyage_id = ? AND token_hash = ?"),
    seatHashes: db.prepare("SELECT role, callsign, token_hash FROM seats WHERE voyage_id = ?"),
    byCode: db.prepare("SELECT id, status, state_json FROM voyages WHERE code = ?"),
    codeExists: db.prepare("SELECT 1 FROM voyages WHERE code = ?"),
    live: db.prepare("SELECT state_json FROM voyages WHERE status IN ('LOBBY', 'ACTIVE')"),
    abandon: db.prepare("UPDATE voyages SET status = 'ABANDONED', updated_at = ? WHERE id = ?"),
    event: db.prepare("INSERT INTO events (voyage_id, at, kind, detail, seq) VALUES (?, ?, ?, ?, ?)"),
    maxSeq: db.prepare("SELECT MAX(seq) AS m FROM events WHERE voyage_id = ?"),
    stateByCode: db.prepare("SELECT state_json, status FROM voyages WHERE code = ?"),
    history: db.prepare(
      `SELECT v.code, v.status, v.outcome, v.failure_cause, v.deepest_phase, v.created_at, v.ended_at,
              v.duration_ms, v.mistakes, v.mode, v.practice, v.rerun,
              (SELECT callsign FROM seats s WHERE s.voyage_id = v.id AND s.role = 'ENGINEER') AS engineer,
              (SELECT callsign FROM seats s WHERE s.voyage_id = v.id AND s.role = 'NAVIGATOR') AS navigator
       FROM voyages v WHERE v.status IN ('ENDED', 'ACTIVE') OR (v.status = 'ABANDONED' AND v.started_at IS NOT NULL)
       ORDER BY COALESCE(v.ended_at, v.updated_at) DESC LIMIT ?`,
    ),
    stats: db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(outcome = 'SURVIVED') AS survived,
              SUM(outcome = 'LOST') AS lost,
              MIN(CASE WHEN outcome = 'SURVIVED' AND practice IS NULL AND mode = 'STANDARD' THEN duration_ms END) AS fastest
       FROM voyages WHERE status = 'ENDED' AND practice IS NULL`,
    ),
    events: db.prepare("SELECT at, kind, detail, seq FROM events WHERE voyage_id = ? ORDER BY id"),
  };

  const statusOf = (v: Voyage): string =>
    v.phase === "LOBBY" ? "LOBBY" : v.phase === "SURVIVED" || v.phase === "LOST" ? "ENDED" : "ACTIVE";

  return {
    raw: db,
    codeExists: (code: string): boolean => Boolean(stmts.codeExists.get(code)),
    insertVoyage(v: Voyage, prevCode: string | null = null, rerun = false): void {
      stmts.insertVoyage.run(v.id, v.code, v.seed, v.createdAt, prevCode, JSON.stringify(v), Date.now(), v.crewId, rerun ? 1 : 0);
    },
    crewRecords(crewId: string): CrewRecord[] {
      return stmts.crewRecords.all(crewId) as CrewRecord[];
    },
    maxSeq(voyageId: string): number {
      return (stmts.maxSeq.get(voyageId) as { m: number | null }).m ?? 0;
    },
    crewOf(code: string): string | null {
      return (stmts.crewOf.get(code) as { crew_id: string } | undefined)?.crew_id ?? null;
    },
    /** An ended voyage's full state (for its debrief page). */
    endedVoyage(code: string): Voyage | null {
      const row = stmts.stateByCode.get(code) as { state_json: string; status: string } | undefined;
      return row && row.status === "ENDED" ? (JSON.parse(row.state_json) as Voyage) : null;
    },
    saveVoyage(v: Voyage): void {
      const ended = v.phase === "SURVIVED" || v.phase === "LOST";
      stmts.saveVoyage.run(
        statusOf(v),
        v.phase,
        v.deepestPhase,
        ended ? v.phase : null,
        v.failureCause,
        v.startedAt,
        v.endedAt,
        ended ? Math.round(v.elapsedMs) : null,
        v.mistakes,
        JSON.stringify(v),
        Date.now(),
        v.mode,
        v.practice,
        v.id,
      );
    },
    insertSeat(voyageId: string, role: Role, callsign: string, tokenHash: string): void {
      stmts.insertSeat.run(voyageId, role, callsign, tokenHash, Date.now());
    },
    roleForToken(voyageId: string, token: string): Role | null {
      const row = stmts.seatByToken.get(voyageId, hashToken(token)) as { role: Role } | undefined;
      return row?.role ?? null;
    },
    seats(voyageId: string): { role: Role; callsign: string; token_hash: string }[] {
      return stmts.seatHashes.all(voyageId) as { role: Role; callsign: string; token_hash: string }[];
    },
    loadByCode(code: string): { id: string; status: string; voyage: Voyage } | null {
      const row = stmts.byCode.get(code) as { id: string; status: string; state_json: string } | undefined;
      return row ? { id: row.id, status: row.status, voyage: JSON.parse(row.state_json) as Voyage } : null;
    },
    loadLive(): Voyage[] {
      return (stmts.live.all() as { state_json: string }[]).map((r) => JSON.parse(r.state_json) as Voyage);
    },
    markAbandoned(id: string): void {
      stmts.abandon.run(Date.now(), id);
    },
    event(voyageId: string, kind: string, detail: string | null = null, seq: number | null = null): void {
      stmts.event.run(voyageId, Date.now(), kind, detail, seq);
    },
    events(voyageId: string): { at: number; kind: string; detail: string | null; seq: number | null }[] {
      return stmts.events.all(voyageId) as { at: number; kind: string; detail: string | null; seq: number | null }[];
    },
    history(limit = 50): HistoryRow[] {
      return stmts.history.all(limit) as HistoryRow[];
    },
    stats(): { total: number; survived: number | null; lost: number | null; fastest: number | null } {
      return stmts.stats.get() as { total: number; survived: number | null; lost: number | null; fastest: number | null };
    },
    close(): void {
      db.close();
    },
  };
}
