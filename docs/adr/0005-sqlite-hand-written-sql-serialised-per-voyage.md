# Persistence is `node:sqlite` with hand-written SQL, fsynced, and serialised per Voyage

Every accepted action is written through to `/data` before it is acknowledged, and two Players can act in the same instant without either action being lost. We chose Node's built-in `node:sqlite` in WAL mode with `synchronous=FULL`, hand-written SQL behind a numbered-migration runner of about 60 lines run at start-up, thin typed repository functions with zod validating every JSON column on read, and one connection with a promise-chain mutex per Voyage around a synchronous `BEGIN IMMEDIATE … COMMIT`. Inside that transaction the server checks the action against the stored sequence number, applies it, and appends the event, with no `await` in between.

## Considered Options

- **better-sqlite3:** the same SQLite and the same speed, and the runner-up. Rejected because it adds a native package that `pnpm install` refuses until it is allow-listed (`ERR_PNPM_IGNORED_BUILDS`). **If `node:sqlite` changes or breaks on a patch release, switch to it;** the repository functions are the only code that touches the driver.
- **Drizzle:** the stable 0.45 line has no `node:sqlite` driver, and the 1.0 line that does is still a release candidate. Importing it spiked to about 280 MB RSS until the heap was capped.
- **Kysely:** light (about 68 MB, 2 packages) but has no built-in `node:sqlite` dialect, and its transactions begin deferred, so `BEGIN IMMEDIATE` is issued by hand anyway.
- **Prisma 7:** 184 packages, 354 MB, about 115 MB RSS, a generated client, a CLI that can't run as a release command (release commands get no volume), and no `node:sqlite` adapter.
- **libSQL embedded:** bundles SQLite 3.45.1, older than the WAL-reset fix.
- **LMDB, JSON or append-only files:** no SQL for the events log, and atomicity and migrations would be ours to write.
- **PGlite:** a first query took 4.8 s and 485 MB, which breaks the 256 MB cap.
- **`synchronous=NORMAL`:** 4–5× faster, but can lose the last commits on power loss. "Written through on every accepted action" is the promise from [What persists, and who sees it?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/10).

## Consequences

- Concurrency evidence: 2000 concurrent actions through the mutex gave exactly 2000, while a naive read, await, write version kept 1 of 200. That is the lost-update bug Dead Air found late.
- About eight `kill -9` runs mid-transaction in WAL mode with `FULL` all recovered: the integrity check passed, the half-written transaction rolled back, and no acknowledged commit was lost. Fly's NVMe fsync cost was not measured.
- The `-wal` and `-shm` files must stay beside the `.db` file, so a backup is never a copy of the `.db` alone. The server runs `VACUUM INTO` `/data/backups/` at start-up and about daily, keeps three, and relies on Fly's default snapshots for an off-volume copy. Whether a snapshot taken mid-write restores through WAL recovery is unverified, which is why the in-volume copy stays. Litestream is rejected as overkill unless losing the whole volume must cost only minutes of data.
- SQLite 3.7.0–3.51.2 has a WAL-reset bug. Node 24.21 bundles 3.53.4, so the Node version stays pinned ([ADR 0003](0003-hono-on-node-runs-typescript-source.md)).
- Stored Draws sit in a `draw` column with `CHECK (json_valid(draw))` beside a `draw_version` column, and a zod schema per Puzzle version parses them on read ([ADR 0001](0001-versioned-puzzle-draw-data.md)). The events table is indexed on `(voyage_id, id)` and `(actor, id)` for the after-the-crit reader.
- Revisit Kysely if the schema passes about 15 tables or the queries turn dynamic, or Drizzle if 1.0 reaches GA with its `node:sqlite` driver.

Evidence: [the stack comparison](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/stack-comparison/docs/research/stack-comparison.md).
