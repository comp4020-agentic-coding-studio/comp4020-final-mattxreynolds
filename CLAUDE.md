# Below the Waterline — engineering constitution

A two-player asymmetric real-time 3D co-op puzzle game (COMP4020 final
project). Engineer in the Engine Room (+ Aux Machinery), Radio Officer / Navigator on
the Bridge (+ Comms Room). One voyage in five acts over a server-side ship
simulation. Read before working:

- `TODO.md` — current board. Update it when you finish or start a chunk.
- `docs/PUZZLES.md` — the rules. Server code implements exactly this.
- `docs/SYSTEMS.md` — the five acts, ship systems, modes, practice, unlocks.
- `docs/ARCHITECTURE.md`, `docs/MULTIPLAYER.md` — structure and protocol.
- `docs/PRODUCT.md` — scope and non-goals. `docs/adr/` — decisions.

## Invariants (never weaken these to make a test pass)

1. **The server owns canonical state.** Clients send intents
   (`shared/protocol.ts`), never truth. No intent may assert completion.
2. **Core puzzles need both players.** Neither role's view may contain the
   information the other role holds. `server/game/views.ts` is the secrecy
   boundary; anything added to state must be deliberately projected there.
3. **Important interactions propagate in real time** (< 1 s) to the other
   seat, with a visible *and* audible consequence on the receiving side.
4. **Phase transitions fire once.** Use `advance(v, from, now)`; never set
   `v.phase` directly.
5. **Intents are idempotent set-operations** (`{open: true}`), not toggles.
6. **Reconnect restores identity, role and state** from the token in
   localStorage + the server snapshot. Tokens are stored hashed and never
   leave the server in any view, event, log line or page.
7. **Persistence claims need SQLite evidence.** Canonical state is written to
   `voyages.state_json`; tests prove it reloads after a restart.
8. **Never use colour as the sole discriminator.** Pair with shape, label,
   position or light pattern.
9. **Every interactable has a purpose.** No decorative buttons that look usable.
10. **`/readme/` is server-rendered** from README.md with every heading present
    in the initial HTML (`spec/invariants.test.ts`, supplied by the course —
    do not modify it or `scripts/check-evidence.ts`).
11. **No test-only shortcuts in production.** `/api/test/*` exists only with
    `ENABLE_TEST_HOOKS=1`. No "solve" buttons in the UI.

## Scope

Dense over large. Do not add scope (new rooms, puzzles, features) until the
full loop Lobby → … → Survived/Lost → Log → Sail again works and is tested.
Not a chat/lobby app: no built-in chat, accounts, avatars or matchmaking.

## Code rules

- TypeScript everywhere; Node runs `server/*.ts` directly (type stripping), so
  server/shared code uses only erasable syntax: no `enum`, no parameter
  properties, no namespaces. Imports name the `.ts` extension.
- Tunable numbers live in `shared/config.ts`, not inline.
- Server game logic is pure and takes `now`; side effects (DB, sockets,
  timers) live in `manager.ts` / `sockets.ts`.
- Client: no per-frame React state. Animate in `useFrame` reading
  `useStore.getState()`. Reuse geometries/materials.
- Rejected intents return a reason code; the client shows a short diegetic
  message, never a stack trace.
- Log lifecycle events (created, joined, started, phase, ended, rejected),
  never tokens, never per-frame input.

## Testing

- `pnpm test:unit` — pure logic, no server needed. Fast loop.
- `pnpm check:local` — builds, starts a throwaway server on a free port with
  a temp DB and test hooks, runs the whole spec. Use this before committing.
- `pnpm check` — the course's command; needs an app at `APP_URL`
  (default `http://localhost:8080`).
- Multiplayer browser tests use **two independent browser contexts**, never
  two tabs of one context.
- Avoid sleeps; wait on state (`waitFor` on a view predicate).

## Agents

- The lead agent owns `shared/`, `server/game/voyage.ts` transitions, the DB
  schema and the protocol. Subagents work inside documented interfaces; if one
  needs a protocol change, it says so in its report rather than editing
  `shared/protocol.ts` silently.
- Verify every subagent claim by reading the diff and running checks.
- When implementation reveals a reusable lesson, add it here.

## Process evidence

`PROCESS.md` records only things that happened, with real commit links.
Never invent user testing or reflection. Sections that need the student's
own judgement are marked `[STUDENT REVIEW]`.

## Lessons

- **Simulate the no-communication strategy for every puzzle.** All four
  puzzles were once solvable blind despite showing asymmetric information.
  Before changing a puzzle rule or number, re-run a blind-play simulation and
  keep the unit tests that assert blind play fails.

- Look up client-supplied keys with `Object.hasOwn`, never `obj[key]`:
  `{t:"toString"}` once crashed the server through `INTENT_RULES[t]`.
- CDP network emulation does not slow an open WebSocket; slow-link tests
  must proxy frames (`slowLink` in spec/helpers/browser.ts).
- Use `res.sendFile(name, { root })`, not an absolute path: a dot-directory
  anywhere in the absolute path makes send 404.
- A toggle's next value must come from what this player last sent, not the
  last rendered view: views arrive every 200 ms, so `!serverValue` sends the
  same value twice on a quick double-press (`useLatched` in scene/interact.tsx).
- Keep the R3F `<Scene>` memoised: the HUD around it re-renders on every view.
- Blind-play simulations must include *reactive* strategies (act on live
  gauges), not only fixed sweeps: a reactive Engineer solved Flood alone.
- Anything ordered by a client-side counter must survive a server restart:
  view `rev` restarted at 0 and open pages silently ignored every new view.
  Seed such counters from the clock or persist them.
- Ship systems are live from Act II to the end: a station's intents may be
  legal in later phases (`INTENT_RULES`), so gate client stations on the
  same phases (`stationMode(…, until)`), never on "my phase only".
- Practice starts come from `scenario.ts` (built from the seed), never from
  a copied save state.
- A shader change can break the real-time guarantee. CPU rasterisers link
  big standard-material variants (PMREM env, normal/roughness maps) about
  100× slower and freeze the page for seconds after mount, which delays
  socket views past 2 s. Profile with two SwiftShader contexts, and add new
  material features through the kits so the `low` tier can drop them
  (ADR 007).
- `ReadyProbe` must wait for every staged mount to finish compiling
  (`scene/loading.ts`). Otherwise take-controls appears while a stage is
  still compiling, and the first control press lands inside a freeze.
- Visual claims need `scripts/screenshot.ts --quality high`. Headless
  Chromium is a software renderer and defaults to the `low` tier.
