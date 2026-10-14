import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Numbered migrations, applied in order at start-up and tracked in
// PRAGMA user_version (ADR 0005). Append; never edit one that has shipped.
const MIGRATIONS: string[] = [
  `CREATE TABLE person (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE session (
     token_hash TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES person(id),
     created_at INTEGER NOT NULL
   );
   CREATE TABLE voyage (
     id TEXT PRIMARY KEY,
     code TEXT NOT NULL UNIQUE,
     link_key TEXT NOT NULL UNIQUE,
     ship_name TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE voyage_person (
     voyage_id TEXT NOT NULL REFERENCES voyage(id),
     person_id TEXT NOT NULL REFERENCES person(id),
     joined_at INTEGER NOT NULL,
     PRIMARY KEY (voyage_id, person_id)
   );
   CREATE TABLE event (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at INTEGER NOT NULL,
     voyage_id TEXT,
     actor TEXT,
     action TEXT NOT NULL,
     detail TEXT NOT NULL CHECK (json_valid(detail))
   );
   CREATE INDEX event_voyage ON event (voyage_id, id);
   CREATE INDEX event_actor ON event (actor, id);`,
  // Deck choice and Cast off. A Person has one seat row per Voyage, so one
  // Deck; the partial unique index makes the first accepted choice win even
  // if the application check is ever bypassed. seq counts accepted intents.
  `ALTER TABLE voyage ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE voyage_person ADD COLUMN deck TEXT CHECK (deck IN ('Upper Deck', 'Lower Deck'));
   ALTER TABLE voyage_person ADD COLUMN cast_off INTEGER NOT NULL DEFAULT 0;
   CREATE UNIQUE INDEX voyage_deck ON voyage_person (voyage_id, deck) WHERE deck IS NOT NULL;`,
  // The Draw, stored in full as JSON at Voyage start with its version (ADR 0001),
  // how many Puzzles are solved (strictly sequential), and the Voyage's Strikes.
  `ALTER TABLE voyage ADD COLUMN draw TEXT CHECK (draw IS NULL OR json_valid(draw));
   ALTER TABLE voyage ADD COLUMN draw_version INTEGER;
   ALTER TABLE voyage ADD COLUMN solved INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE voyage ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;`,
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN IMMEDIATE");
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec("COMMIT");
  }
}

// ADR 0005: WAL with synchronous=FULL, so an accepted action is on disk
// before it is acknowledged. The -wal and -shm files sit beside the .db.
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "game.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  migrate(db);
  return db;
}
