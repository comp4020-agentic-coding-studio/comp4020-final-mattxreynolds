# ADR 003 — SQLite via node:sqlite, whole-state snapshots

## Context
Course Fly shape: one 256 MB machine, one volume at `/data`, machine stops
when idle. Voyages must survive stop/start and redeploys, including in-progress
ones.

## Options
1. Postgres — outside the course setup.
2. SQLite with an ORM (Drizzle/Prisma) — extra build/migration tooling.
3. SQLite with Node 24's built-in `node:sqlite` and hand-written SQL.
4. JSON files — no transactions, awkward queries for the log.

## Decision
Option 3. Relational columns for what the log and queries need (code,
status, outcome, durations, seats), plus `state_json` with the full canonical
voyage. Written after every applied intent and every 2 s while live; loaded
back on boot.

## Consequences
No native module build in Docker. Schema migrations are a small versioned
list in `server/db.ts`. A crash loses at most ~2 s of continuous simulation
(not player actions, which are written immediately).
