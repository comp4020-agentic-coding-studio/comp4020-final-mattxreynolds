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

## Recovery, and correction from screenshots

`spec/realtime.test.ts`: live fan-out to both projections, isolated SSE,
transient presence, reconnect after end, personalised live station logs.
`spec/persistence.test.ts`: independent server restarts with the same SQLite
file preserve device/revision/deadline and late crew; expiry during downtime
logs exactly once; a C8 room loads with revision zero.

`spec/browser.test.ts`: independent Chromium contexts, actual join/seat/action
buttons, visible strikes in under one second, isolated third room, refreshed
Expert seat, offline controls, completion seen by an open lobby, recovery to
the final result, Expert starting the next mission, leave/rejoin presence,
390px device/manual layouts, racing buttons and a delayed real HTTP response.
Both browser tests passed. Screenshot inspection found the reconnect warning
was below the long manual on a phone. Moved it above the timer and added a
viewport assertion. A first rerun hit stale asset references because the
production server still held the previous build's index; restarting after the
build corrected the verification setup. The clean rerun passed both tests.

Separately drove a whole defusal using the UI's displayed wires, symbols,
keypad and switches, with Expert Begin and Operator actions in separate
contexts. Expert's clock was deliberately 45 seconds fast: both showed 04:51
at override, the run ended secured with zero strikes, and both browser
page-error/console-error lists were empty. Desktop and narrow screenshots were
visually inspected, alongside the reconnect screenshot. This is agent-run UI
inspection, not evidence of classmates enjoying the game or a human pod trial.

## Final production-style suite

`PLAYWRIGHT_BROWSERS_PATH=/tmp/c9-browsers EVIDENCE_DIR=/tmp/c9-ui pnpm check`:
8 files, 43 tests passed, including typecheck. Browser timing measured from the
outgoing POST to the remote DOM: 19 ms to Expert strike; 6 ms to the open
station log. The tests assert <1000 ms; timings describe this local run only.
`pnpm build` passed. `pnpm check:evidence` passed. No lint/format script exists;
`git diff --check` is the whitespace check. Final documentation: README within
400–600 words, PROCESS within 900–1100, reflection within 150–300 with both
standing prompts. Production deployment is intentionally left to the existing
`main` merge workflow; these results do not claim the branch is deployed.

## Final acknowledgement correction and independent review

After the 43-check milestone, a held HTTP acknowledgement showed that pending
controls never recovered. The browser probe failed after seven seconds despite
revision 1 already being streamed. `AbortSignal.timeout(5000)` now releases the
pending state and reports uncertainty; no automatic retry occurs. The probe
passed, with revision still 1 until the player's explicit next action.

Independent specification review found a body-read variant: `api` swallowed
an abort after 200 headers and returned `{}`. `spec/api.test.ts` uses a real
HTTP server with a partial, unfinished JSON response: first failed (resolved
`{}`), then passed after preserving abort/timeout errors. The reviewer checked
the correction and reported no remaining findings. The standards review
reported no documented-standard violations or actionable smells.

Final commands, after rebuilding and restarting the production server:

- `PLAYWRIGHT_BROWSERS_PATH=/tmp/c9-browsers EVIDENCE_DIR=/tmp/c9-ui pnpm check`:
  typecheck and all **45 tests in 9 files passed**; browser timings 19 ms/6 ms.
- `pnpm build`, `pnpm check:evidence`, `git diff --check`: passed.
- Word counts: README 596, PROCESS 1043, reflection 264 (including headings).

The Docker CLI is not connected to a daemon in this WSL environment, so local
verification used the actual production Node/Vite app rather than an image.
The existing PR CI builds/runs the Docker image and repeats the checks. GitHub
reports a public, non-template repo with `FLY_API_TOKEN` configured; merge to
`main` triggers the unchanged Fly deployment job. Already-open C8 tabs must
refresh once after deployment to load the new command contract.
