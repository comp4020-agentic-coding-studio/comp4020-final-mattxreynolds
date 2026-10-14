import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// ADR 0005: WAL with synchronous=FULL, so an accepted action is on disk
// before it is acknowledged. The -wal and -shm files sit beside the .db.
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "game.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  return db;
}
