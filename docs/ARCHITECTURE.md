# Architecture

One Node process serves everything: the built client, `/readme/`,
`/history/`, a small JSON API and a Socket.IO endpoint. One SQLite file holds
all durable state. This matches the course Fly shape (one 256 MB machine, one
volume at `/data`).

```
browser (React + R3F)  ──HTTP──▶  Express  ──▶  /, /readme/, /history/, /api/*
        │                                    
        └──Socket.IO (intents) ──▶ VoyageManager ──▶ Voyage (pure state machine)
                ◀── per-role snapshots ──┘        │
                                                  └──▶ SQLite (node:sqlite)
```

## Folder structure

```
shared/            Imported by both server and client. No Node or DOM APIs.
  config.ts        Every tunable number (rates, capacities, windows).
  protocol.ts      Intent union, server→client events, RoleView types.
  glyphs.ts        Glyph ids and display names (names are for the log only).
  rng.ts           Seeded PRNG (mulberry32) used by puzzle generation.
server/
  index.ts         Entry: env, DB, HTTP server, Socket.IO, shutdown.
  http.ts          Express app: static client, /readme/, /history/, /api/*.
  pages.ts         Server-rendered HTML pages (readme, history, shell).
  db.ts            SQLite open, migrations, voyage/seat/event queries.
  sockets.ts       Socket.IO wiring: hello/identify, intent dispatch.
  manager.ts       VoyageManager: in-memory live voyages, tick loop,
                   persistence, broadcasting per-role views.
  game/
    state.ts       Voyage state type, creation, upgrade of old saves, event notes.
    voyage.ts      Reducer: applyIntent, tick, guarded transitions, danger.
    ship.ts        Continuous systems: grid, water, hull, Act IV, accumulator.
    scenario.ts    Practice starts: earlier acts set up from the seed.
    debrief.ts     Timeline samples, highlights and lessons at the end.
    puzzles.ts     Seeded generation of every phase's config (incl. Act IV).
    views.ts       Projects canonical state → RoleView (the secrecy boundary).
client/
  index.html       Vite entry (served at / and /v/:code).
  main.tsx         React root.
  net.ts           Socket client, identity token, reconnect.
  store.ts         Zustand store holding the latest RoleView + feedback.
  ui/              HTML overlay: Home, Lobby, HUD, Endings, panels,
                   TouchControls (stick, look, USE; ADR 008).
  scene/           React Three Fiber: Engine Room, Bridge, interactables.
    input.ts       One press/hold path for E, click, USE and tap; touch input state.
    touch.ts       Touch maths: stick, taps, fingertip ring, prompt wording, portrait lens.
    look/          Shared render look: relief maps, env map, bloom + grade, quality tiers (ADR 007).
    fx/            Pooled particles, per-act atmosphere, Bridge distress.
    loading.ts     First-mount gate: take-controls waits for staged compiles.
  audio.ts         WebAudio procedural sound.
spec/              Vitest: unit (pure, no server) + app (against running app).
```

## State machine

`LOBBY → PROLOGUE → POWER → FLOOD → RADIO → CASCADE → ESCAPE → SURVIVED | LOST`

Acts are a projection of phases (`ACT_OF` in `shared/protocol.ts`): I =
PROLOGUE+POWER, II = FLOOD, III = RADIO, IV = CASCADE, V = ESCAPE. From
FLOOD to the end, `tick` also advances the ship systems in `ship.ts` (see
docs/SYSTEMS.md and ADR 005). A practice voyage leaves LOBBY straight into
its chosen act through the same guarded `advance`.

`Voyage` is a plain serialisable object. All mutation goes through two pure
functions in `server/game/voyage.ts`:

- `applyIntent(v, role, intent, now) → {ok:true, events} | {ok:false, reason}`
- `tick(v, now) → events`

Both call `checkProgress(v, now)`, which evaluates the current phase's
completion predicate and calls `advance(v, from, now)`. `advance` only acts if
`v.phase === from`, so a phase can only complete once even if two intents
satisfy the predicate in the same tick. Danger ≥ 100 calls `lose()`, guarded
the same way. Time is injected (`now`) so tests are deterministic.

## Persistence

`node:sqlite` (built into Node 24; no native build step, no ORM). Tables:

- `voyages(id, code, seed, status, phase, deepest_phase, outcome,
  failure_cause, created_at, started_at, ended_at, duration_ms, mistakes,
  state_json, updated_at, prev_code)`
- `seats(voyage_id, role, callsign, token_hash, joined_at)`
- `events(id, voyage_id, at, kind, detail, seq)`: public, non-secret
  history. Lifecycle rows plus a copy of every significant voyage event
  (`log.*`) with its monotonically increasing sequence number.
- `voyages` also carries `mode`, `practice`, `rerun` and `crew_id` (a
  pair's lineage across voyages; unlocks are computed from it).

The ended voyage's debrief (timeline samples, highlights, lessons and the
ordered event log) is part of `state_json` and is rendered at `/log/CODE/`.

`state_json` is the full canonical `Voyage`. It is written immediately after
every applied intent and at least every 2 s while a voyage is live; on boot,
live voyages are loaded back into memory. Elapsed time across a restart is
treated as a pause: tick deltas are capped at 1 s, so an outage does not drown
the crew.

Tokens are stored as SHA-256 hashes. The raw token lives only in the
player's `localStorage`.

## Real-time

Socket.IO. Clients emit `intent` with `{seq, intent}`. Server answers with an
ack `{ok, reason?}`, and broadcasts a fresh `view` to both seats. Views are
role-specific (computed by `views.ts`), so one player's privileged
information (diagram, mapping, band) never crosses the wire to the other. A
tick loop runs at 5 Hz for live voyages; views are pushed at most every 200 ms
when continuous values (water, pressure) change. No per-frame transforms are
sent.

## Client

React owns overlays and routing; R3F owns the 3D scene. The scene reads the
store via `useStore.getState()` inside `useFrame` for animated values (no
per-frame React re-render) and subscribes with selectors for discrete state.
Interactables are declared with an `<Interactable id prompt onUse>` wrapper
that the first-person controller raycasts against.

Every room mounts `<Look/>` (scene/look/PostFX.tsx): on the `high` tier an
environment map and an EffectComposer (bloom → grade → output) that takes
over rendering via a priority-1 `useFrame`; on `low`, plain rendering.
Disaster effects (water, spray, steam, sparks, smoke, camera roll) read the
view in `useFrame` and never affect state. The Bridge mounts heavy parts in
stages (`Staged` → `Warm`, which compiles shaders with `compileAsync`); each
stage holds a ticket in `scene/loading.ts`, and the briefing card's
take-controls button appears only when no tickets remain and frames are
smooth.

## Testing

Three Vitest projects (`vitest.config.ts`):

- **unit**: `spec/*.unit.test.ts`. Pure logic: generation uniqueness,
  reducer rules, transitions firing once, the full voyage solved through the
  reducer, and **blind-play simulations that must fail**.
- **app**: the other `spec/*.test.ts` files, run against the running app
  (`APP_URL`): invariants, pages, socket multi-client flows. Specs needing test
  hooks or restarts (persistence, secrecy, authority, replay) start their own
  server via `spec/helpers/server.ts`.
- **browser**: `spec/browser-*.test.ts`. Playwright with two independent
  browser contexts, one file at a time. The full-voyage spec needs test hooks
  and skips against CI's production image.
- Test-only hooks (`/api/test/*`) exist only when `ENABLE_TEST_HOOKS=1`; they
  are never on in production.

## Production

`pnpm build` → `dist/`. `node server/index.ts` serves `dist/`, listens on
`0.0.0.0:$PORT`, DB at `$DATABASE_PATH` (default `./data/below-waterline.sqlite`,
Docker sets `/data/below-waterline.sqlite`). SIGTERM flushes all live voyages
then closes the DB.

## Development workflow

`pnpm dev` runs the server with `--watch` and Vite in middleware mode (HMR).
`pnpm check` needs a running app (as the starter harness requires);
`pnpm check:local` builds, starts a throwaway server and runs `pnpm check`
against it.
