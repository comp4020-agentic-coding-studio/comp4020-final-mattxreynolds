import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDatabase } from "../server/database.ts";

it("opens under DATA_DIR in WAL mode with synchronous=FULL", () => {
  const dir = mkdtempSync(join(tmpdir(), "db-"));
  const db = openDatabase(dir);
  expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
  // SQLite numbers its synchronous levels: 0 OFF, 1 NORMAL, 2 FULL
  expect(db.prepare("PRAGMA synchronous").get()).toEqual({ synchronous: 2 });
  db.close();
});
