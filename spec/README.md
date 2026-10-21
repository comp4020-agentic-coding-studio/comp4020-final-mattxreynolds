# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## What this game's checks protect

Each file names the promise it holds in its header comment and `describe`
blocks. App specs marked *own server* start a private server
(`helpers/server.ts`: free port, temp SQLite file, `ENABLE_TEST_HOOKS=1`) so
they can read hidden config, jump phases or restart the process; they never
rely on hooks in the app at `APP_URL`, which in CI is the production image
without them. Every spawned server is killed in `afterAll`, and on worker exit.

| Spec | Promise |
|---|---|
| `invariants.test.ts` | Supplied by the course (above). Unmodified. |
| `voyage.unit.test.ts` | Every phase is solvable as specified; rules, danger, pause and transitions-once hold in the pure reducer; malformed intents (including `{t:"toString"}`) are rejected, never thrown. |
| `session.test.ts` | Two distinct identities, server-assigned roles, a third player refused, ready/start, cross-room effects in < 1 s, reconnect restores the seat. |
| `persistence.test.ts` *(own server)* | Canonical state survives SIGTERM and SIGKILL: same code, roles, phase and puzzle state from the same tokens; downtime is not play time; the last acknowledged intent is on disk. Finished voyages (SURVIVED and LOST with cause and phase) stay in `/history/` and `/api/history` across a restart, with no token anywhere. |
| `secrecy.test.ts` *(own server)* | In every phase, the Engineer's view holds none of the Navigator's facts (diagram, short, other compartments, trends, pumps, channel, stations, band) and vice versa (loads, capacity, valves, resonance, pulse, antenna, hydraulic pressure); no view ever carries `config`, `seed`, `token` or `token_hash`. |
| `authority.test.ts` *(own server)* | The server owns truth: unknown types, completion-asserting fields and malformed payloads change nothing (`bad-input`); wrong role, wrong phase, stale and post-ending intents are refused; an un-greeted socket is `not-seated`; concurrent intents are serialised so each transition fires once (checked in the SQLite event log); set-operations are idempotent. |
| `presence.test.ts` | A partner gone > 3 s pauses the voyage (no danger, controls `paused`) until they return; a lobby drop clears ready; two tabs of one profile are one player; a started or half-filled voyage never admits a stranger or starts. |
| `replay.test.ts` *(own server)* | Sail again moves both players to one new voyage with the same roles and tokens; the old voyage stays in the log; a second request reuses the same voyage. |
| `pages.test.ts` | `/readme/` and `/history/` are complete server-rendered HTML, callsigns are escaped, `/healthz` is JSON, unknown paths get a 404 page, `/readme` and `/history` redirect, `/v/CODE` serves the game shell. |
| `browser-multiplayer.test.ts` | The marker's walkthrough in two browser profiles: create, join by link, ready, a cross-room effect without reload, refresh restores the seat, a third profile is told the voyage is full. |
| `browser-resilience.test.ts` | On a 400 ms link (HTTP and WebSocket) create/join/ready work and the lever reaches the Bridge in < 2 s; going offline shows the partner "lost connection" and coming back restores role and phase without a reload; a normal session logs no console errors. |

### Running them

- `pnpm test:unit` — pure logic, no server needed.
- `node scripts/check-local.ts` (or `pnpm check:local`) — builds the client,
  starts a throwaway production server and runs `pnpm check` against it.
  Add `--no-build` to reuse an existing `dist/`.
- `pnpm check` — needs an app at `APP_URL`; the *own server* specs start
  their own regardless.
