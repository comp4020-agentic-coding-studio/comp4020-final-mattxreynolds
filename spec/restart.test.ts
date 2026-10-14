import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";

it("answers after a restart on the same DATA_DIR, with the database in WAL mode", async () => {
  const first = await startSecondServer();
  expect((await fetch(new URL("/readme/", first.url))).status).toBe(200);
  expect(await first.stop()).toBe(0);

  const db = new DatabaseSync(join(first.dataDir, "game.db"), { readOnly: true });
  expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
  db.close();

  const second = await startSecondServer({ dataDir: first.dataDir });
  expect((await fetch(new URL("/readme/", second.url))).status).toBe(200);
  expect(await second.stop()).toBe(0);
});

it("stops promptly and cleanly on SIGTERM", async () => {
  const server = await startSecondServer();
  const started = Date.now();
  expect(await server.stop()).toBe(0);
  expect(Date.now() - started).toBeLessThan(2000);
});
