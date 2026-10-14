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
  // How a Voyage finished: NULL while unfinished, 'abandoned' once either
  // Player ends it. Later outcomes (launched, sank) widen the CHECK.
  `ALTER TABLE voyage ADD COLUMN outcome TEXT CHECK (outcome IN ('abandoned'));
   ALTER TABLE voyage ADD COLUMN ended_at INTEGER;`,
  // Where the Walker stands in the live blind navigator Puzzle, as JSON [x, y];
  // NULL means the start.
  `ALTER TABLE voyage ADD COLUMN walk_pos TEXT CHECK (walk_pos IS NULL OR json_valid(walk_pos));`,
  // Credentials live apart from the Person (ADR 0002). username_key is the
  // lower-cased username; password_hash is "salt:scrypt" in hex.
  `CREATE TABLE account (
     person_id TEXT PRIMARY KEY REFERENCES person(id),
     username_key TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Low-trust rows (#57): one pose and one draft per Player per Voyage,
  // overwritten in place. Not events: nothing here is logged.
  `CREATE TABLE pose (
     voyage_id TEXT NOT NULL REFERENCES voyage(id),
     person_id TEXT NOT NULL REFERENCES person(id),
     x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, yaw REAL NOT NULL, pitch REAL NOT NULL,
     PRIMARY KEY (voyage_id, person_id)
   );
   CREATE TABLE keypad_draft (
     voyage_id TEXT NOT NULL REFERENCES voyage(id),
     person_id TEXT NOT NULL REFERENCES person(id),
     slot TEXT NOT NULL,
     text TEXT NOT NULL,
     PRIMARY KEY (voyage_id, person_id, slot)
   );`,
  // The Clock (#23, #49). cast_off_at is when the Voyage started; the Clock is
  // a pure function of it, strikes and now(). outcome widens to launched and
  // sank (a CHECK can't be altered, so the column is replaced); score_ms is
  // set only by the server at a launch, and no intent can reach it.
  `ALTER TABLE voyage ADD COLUMN cast_off_at INTEGER;
   ALTER TABLE voyage ADD COLUMN score_ms INTEGER;
   ALTER TABLE voyage ADD COLUMN outcome2 TEXT CHECK (outcome2 IN ('abandoned', 'launched', 'sank'));
   UPDATE voyage SET outcome2 = outcome;
   ALTER TABLE voyage DROP COLUMN outcome;
   ALTER TABLE voyage RENAME COLUMN outcome2 TO outcome;`,
  // The finale's live instrument (#48): one row per Voyage, overwritten by each
  // dial turn. in_band_since is when the gauges last entered band, NULL while out.
  `CREATE TABLE instrument (
     voyage_id TEXT PRIMARY KEY REFERENCES voyage(id),
     valves TEXT NOT NULL CHECK (json_valid(valves)),
     trims TEXT NOT NULL CHECK (json_valid(trims)),
     in_band_since INTEGER
   );`,
  // The Leaderboard (#67). An entry exists only once both Players consented;
  // it holds just the names and the Score, copied at posting. hidden is set by
  // the moderation script and nothing else.
  `CREATE TABLE leaderboard_consent (
     voyage_id TEXT NOT NULL REFERENCES voyage(id),
     person_id TEXT NOT NULL REFERENCES person(id),
     PRIMARY KEY (voyage_id, person_id)
   );
   CREATE TABLE leaderboard_entry (
     voyage_id TEXT PRIMARY KEY REFERENCES voyage(id),
     players TEXT NOT NULL,
     score_ms INTEGER NOT NULL,
     posted_at INTEGER NOT NULL,
     hidden INTEGER NOT NULL DEFAULT 0
   );`,
  // Sail again (#61): the new Voyage a finished one led to, and who opened it.
  // One row per finished Voyage, so both Players' taps land in the same lobby.
  `CREATE TABLE sail_again (
     from_voyage TEXT PRIMARY KEY REFERENCES voyage(id),
     new_voyage TEXT NOT NULL REFERENCES voyage(id),
     started_by TEXT NOT NULL REFERENCES person(id)
   );`,
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
