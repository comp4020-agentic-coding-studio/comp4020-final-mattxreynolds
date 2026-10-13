# C9 audit — 13 October 2026

Starting point: clean `main` at `2aab958`, remote up to date; work on
`c9-all-at-once`. Read the live [C9 brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/)
and [final project contract](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/),
README, PROCESS, CLAUDE, C8 reflection, domain instructions, server/client,
SQLite schema, specs, deployment workflow and C8 history. No existing ADR/glossary.

## Baseline

Production Vite build, Node 24 server with disposable SQLite in
`/tmp/dead-air-c9`. `pnpm check`: 21/21 tests pass.
`pnpm exec vitest run spec/multiplayer.test.ts`: two failures:

- `cut wire: 999` returns 409 after `apply` has already started the mission.
  This rejected mutation is cached without save or broadcast. C8 only tested
  a non-integer field, leaving integer bounds uncovered.
- Two independent players concurrently flip the same switch; both requests
  succeed and the switch returns to its original position. The server is
  serial, but never checks what state either player acted on. A keypad repeat
  can similarly act on the next stage instead of the stage described aloud.

## Inspection findings

- SSE sends full, role-filtered views on connect, with separate room sets.
  Existing timing check uses a real second HTTP client, but not a browser.
- POST responses and SSE both overwrite the client view. A delayed HTTP
  response can restore an older mission or strike count after a newer event.
- `useRoom` ignores retrying stream errors; LINK depends on having any view,
  so it keeps claiming LIVE while offline. Controls remain enabled.
- Reconnect already gets a snapshot, but there is no visible recovery state
  or guard against acting on the disconnected snapshot.
- Disconnect broadcasts presence and cancels heartbeat; empty room sets stay
  allocated. Live join enlists a player in memory without saving that crew.
- The deadline is persisted and restored, but action processing relies on
  the timeout callback having run. Validate time at the command boundary too.
- Station-log polling is 10 seconds: a finished run misses C9 in open lobbies.
- Seats are views, not credentials: anyone with the code can switch seats.
  Preserve solo play; do not claim security between players who can choose roles.

The definition of good stays: communication is the game; a strike should
reflect a mistaken instruction, not an invisible race or an accidental retry.

## First verification

Two Chromium contexts (1440×900 and 390×844) joined through the actual UI,
with different local-storage player ids. Operator override → Expert strike
rendered in 48 ms. Taking the Expert offline left `LINK: LIVE` visible after
1.2 seconds, confirming the connection-state defect in the real browser.

After revision guards, bounds validation and transactional state/log writes:
`pnpm check` passed 23 tests; the expanded
`pnpm exec vitest run spec/multiplayer.test.ts` passed 14 checks, including
same-snapshot flips, keypad duplicates, Expert Begin vs Operator flip,
old-mission actions, concurrent resets, filtered conflict views and invalid
bounds/revisions. These are arrival-order checks, not assertions that a
particular player always wins.
