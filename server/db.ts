import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// One SQLite file on the Fly volume (/data), the only storage that survives a
// restart or redeploy. Locally it lands in ./data.
const dir = process.env.DATA_DIR ?? (process.env.NODE_ENV === "production" ? "/data" : "data");
mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(path.join(dir, "dead-air.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL UNIQUE,
    callsign TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    mission_no INTEGER NOT NULL,
    serial TEXT NOT NULL,
    outcome TEXT NOT NULL,
    modules_cleared INTEGER NOT NULL,
    strikes INTEGER NOT NULL,
    ms_left INTEGER NOT NULL,
    crew TEXT NOT NULL,
    ended_at INTEGER NOT NULL
  );
`);
