# Which stack? Comparison and measurements

Research for [Which stack?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/12),
part of the planning map [#2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/2).
Gathered 2026-10-13 by five research agents, each covering one cluster, and merged here.
The decisions are in ADRs
[0003](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/docs/stack-decision/docs/adr/0003-hono-on-node-runs-typescript-source.md),
[0004](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/docs/stack-decision/docs/adr/0004-real-time-is-sse-plus-typed-posts.md),
[0005](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/docs/stack-decision/docs/adr/0005-sqlite-hand-written-sql-serialised-per-voyage.md),
[0006](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/docs/stack-decision/docs/adr/0006-vite-spa-svelte-chrome-vanilla-three.md) and
[0007](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/docs/stack-decision/docs/adr/0007-one-package-answers-stay-under-server.md).
This file is the evidence behind them. The ADRs argue; this records what was measured.

**The brief given to every agent.** Familiarity was not a criterion: the developer asked for the best-suited
technology, not the known one. The criteria, in order, were fit with the 256 MB shared-CPU auto-stop
machine; correctness of SSE, cookies and reconnect; speed and reliability of building it in about five days
with an AI coding agent; testability over HTTP; maturity and licence; explainability in writing.

**How to read the numbers.** Every measurement is **relative**. They were taken on a 12-core WSL2 machine
(Node 24.21.0, pnpm 11.9.0) with the process limited by a systemd scope (`CPUQuota=25%`,
`MemoryMax=256M`, swap off) or `docker run --cpus 0.25 --memory 256m` where Docker existed. Neither is
Fly: fsync, CPU throttling and cold start there were not measured. Run-to-run noise was about 15%, and
cold starts moved more (0.8 to 1.4 s). **Fact** means a primary source says it; **Measured** means an agent
ran it on 2026-10-13; **Judgement** is a recommendation the sources don't settle.

Scripts and Dockerfiles that produced the numbers are beside this file in
[`stack-comparison/`](stack-comparison/): `scripts/` (servers, load and cold-start drivers, compression and
size scripts), `persistence/` (the SQLite benchmarks, the per-Voyage mutex test and the crash test) and
`image/` (the four base-image Dockerfiles and their test server). Install trees (`node_modules`, build
output, browsers) are not kept; each script's package versions are listed below.

---

## 0. What Dead Air's stack taught

Dead Air (crit 8, still on `main`) ran Express 5, React 19, Vite 8, `node:sqlite`, SSE plus POST,
Playwright 1.64 and `marked`. Its recorded problems were design defects, not framework faults:

- **Lost updates.** Two same-snapshot flips both succeeded and cancelled each other; a repeated keypad
  request acted on an unseen stage. The server was serial but never checked which state the player acted on
  (`main:docs/evidence/c9-audit.md`, "Baseline").
- **A rejected mutation kept in memory.** `cut wire: 999` returned 409 but had already started the mission in
  the in-memory room cache, with no save or broadcast.
- **Client races.** POST responses and SSE both overwrote the client's view, so a delayed response could
  restore older state. Fixed by making SSE the only source of state, a revision guard, and a 5 s timeout on POSTs.
- **A stale production index.** The server reads the Vite index at start-up, so a rebuild needed a restart.
- **Browser tests need a Chromium install** in CI (`playwright install --with-deps chromium`).

What worked: SSE plus POST through Fly's proxy with a 25 s heartbeat and a 64 KB `writableLength` guard;
`node:sqlite` in WAL mode, with a persistence spec that started independent server processes on the same
file and showed state surviving restarts; a shared `shared/game.ts` that kept rule text beside logic and let
2000 generated devices be checked; 45 tests in 9 files, green in CI.

Recorded numbers: CI `check` job 49–77 s (Docker build 11–22 s, spec 3–17 s, Playwright Chromium install
21 s); `flyctl deploy` 59–60 s; cold start 3.8 s then 0.05 s (one sample); bare `node:http` baseline RSS
60 MB, 66 MB at 100 open SSE streams, 91 MB at 1000 (about 30 KB per stream). Not recorded: Dead Air's own
RSS, Vite build time, flake rates, auto-stop timing in production.

**What this tells us.** It is weak evidence for or against any stack, because the pain was in concurrency
design and client state, not in Express, React or Vite. It is strong evidence for the concurrency design
(a sequence check, serialised per Voyage) and for SSE as the only source of client state.

**The brief.** "You pick the stack and justify it in `PROCESS.md`." Marking weights are legibility of
process 50%, deployed app 25%, response to the brief 25%; no criterion scores the technology directly, so a
stack is judged through how well it is justified. The top band expects robustness under simultaneous
actions and slow connections.

---

## 1. Runtime

Each server: a hello-world SSE route plus a cookie-checked `POST /intent` validated by one zod 4 schema
(Elysia used its own TypeBox schema). Cold start is spawn to first HTTP response, warm file cache, including
`systemd-run` overhead. Request rate is 16 keep-alive clients for 6 s with 10% invalid bodies.

| | Node 24.21 (type stripping) | Bun 1.4.3 | Deno 2.9.6 |
|---|---|---|---|
| Docker amd64 compressed | slim 81 MB, alpine 62 MB | slim 74 MB, alpine 47 MB | alpine 49 MB, debian 73 MB |
| Idle RSS, bare hello | 61 MB (`.mjs`); 77 MB loading a `.ts` file | 17 MB | 33 MB |
| Idle RSS, hello + zod POST | ~88 MB (Hono, `.ts`) | ~31 MB | ~47 MB |
| RSS, 500 SSE clients | 95 MB bare `.ts`; 111 MB Hono `.ts` | 43 MB native; 53 MB Elysia | 86 MB (50 MB bare) |
| Cold start, bare / with framework | 0.2 s (`.mjs`), 0.4 s (`.ts`) / 0.8–1.4 s | 0.05 s / 0.13–0.4 s | 0.27 s / 0.4–2.9 s (noisy) |
| POST req/s at 25% CPU | 1.4k–2.8k | 3.5k–4.6k | 1.8k–4k |
| SQLite | `node:sqlite`, no flag, "Stability: 1.2 – Release candidate" | `bun:sqlite` and `node:sqlite` both load | `node:sqlite` loads |

- **Type stripping costs memory and start time (Measured):** about 16 MB RSS and 200 ms (bare `.ts` 77 MB
  against `.mjs` 61 MB). Pre-stripping Hono's `.ts` to `.mjs` gave 75.5 MB against 89 MB.
- **Type stripping is stable (Fact):** Stability 2 since Node 24.12. Limits: erasable syntax only (no enums,
  parameter properties, runtime namespaces), mandatory `.ts` extensions in imports, `tsconfig.json` ignored,
  no `.ts` files under `node_modules` ([Node TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)).
- **The one stability risk on Node is `node:sqlite`:** a release candidate whose API can still change
  between minors, so Node is pinned. Fallback: `better-sqlite3`.
- **Client-disconnect detection (Measured):** with 20 SSE clients destroyed, Node (Hono `onAbort`), Bun and
  Deno (`ReadableStream` `cancel`) all dropped the open count to 0 within 2.5 s.
- **Footguns:** Bun's default `idleTimeout` is 10 s and silently kills SSE sockets (raise it to 255 or 0);
  Elysia and Bun have no Node-style `req.on('close')`; Deno has isolated `node_modules`, permission flags and
  a 24 h default minimum package age. Neither Bun nor Deno has a first-class Fly builder (both work from a
  Dockerfile).
- **Everything fits in 256 MB.** Even Node with 500 connections uses under half of it.

**Judgement:** Node 24, pinned to 24.21.x. Least runtime risk; the platform Playwright, Vitest and the course
CI use; the same runtime for the CI spec helper that starts a second server. Bun uses a third of the memory
and starts 4–8× faster, but the gap isn't binding next to Fly's own cold start, and it has the SSE
idle-timeout trap. **Flips if** a real Fly measurement shows Node's cold start hurting the marker, or
`node:sqlite` breaks on a patch release.

---

## 2. Framework

All on Node, same harness. Package versions (`npm view`, 2026-10-13, all MIT): express 5.3.0, fastify
5.12.7, hono 4.13.13 with @hono/node-server 2.1.5, elysia 1.4.30, ws 8.22.0, socket.io 4.8.4, zod 4.6.7.

| | node:http | Express 5 | Fastify 5 | Hono | Elysia (Bun) |
|---|---|---|---|---|---|
| Idle RSS | 88 MB (`.ts`) | 85 | 92 | 89 | 38 |
| RSS, 500 SSE | 102 | 103 | 108 | 112 | 53 |
| POST req/s (25% CPU) | 2.2k–2.5k | 1.4k–1.6k | 2.6k–2.8k (zod); 1.7k (Ajv/TypeBox) | 1.8k–2.5k | 3.5k |
| Cold start | 0.8 s | 0.9–1.4 s | 1.2–1.3 s (2.3–5.6 s in one noisy run) | 0.8–0.9 s | 0.3–0.4 s |
| Packages installed (size) | 0 | 65 (4 MB) | ~47 (15–16 MB) | 2 (4 MB) | 17 (8.5 MB) |
| SSE | manual, `req.on('close')` | manual `res.write`, `req.on('close')` | `reply.hijack()` + `reply.raw` (hooks and `setCookie` don't apply to raw writes), or `@fastify/sse` 0.6.1 (pre-1.0) | `streamSSE` with `onAbort`, `writeSSE`; no built-in heartbeat | `ReadableStream` |
| Cookies | manual; `cookie` 2.0.1 is one dependency | `cookie-parser`; `res.cookie` built in | `@fastify/cookie` 11.1.3 | `hono/cookie` built in | built in |
| Validation | none, or zod by hand | none, or zod by hand | schemas built in (Ajv/TypeBox), or zod via type provider; **runs before the handler, default error 400** | `@hono/zod-validator`; 400 vs 422 configurable | TypeBox built in; **422 default** |
| Rate limit | hand-rolled | `express-rate-limit` 8.7.1 | `@fastify/rate-limit` 11.2.1 | `hono-rate-limiter` 0.5.4 | plugin |

- **Why ordering matters (Judgement):** the identity decision fixed the refusal order 401 → 403 → 403 → 409 →
  400 with answers throttled (429). Fastify validating before the handler would put a 400 ahead of the 401,
  403 and 409. The ordered chain is easiest as hand-written middleware: auth, then ownership and phase, then
  state, then body validation, then throttle. Where the 429 sits matters: after the 400, a bad-body flood
  isn't throttled.
- **Hono's weak spot:** SSE heartbeat is a hand-written loop (`s.sleep` plus `write`), and errors thrown inside
  the stream skip `onError` ([Hono streaming docs](https://hono.dev/docs/helpers/streaming)). Hono wraps Node
  streams in web streams, so heartbeat and backpressure need an early test.
- **One more data point (client/3D agent):** its first hand-written SSE handler crashed with "Controller is
  already closed" on client disconnect under a framework; any streaming code needs `cancel()` cleanup, which
  Hono's `streamSSE` provides.

**Judgement:** Hono, with zod called by hand after the state checks. Smallest dependency weight, typed
cookies built in, web-standard `Request`/`Response`, disconnect detection verified. About 8 MB heavier and
0.3 s slower to start than plain `node:http`. **Runner-up: Express 5**, the most training data, ran SSE on
this exact setup in Dead Air with no recorded failure, about half Hono's throughput (irrelevant at this
load). **Flips to Express if** a day-one spike shows a streaming or backpressure bug in Hono; to Fastify with
TypeBox only if schemas should be the source of truth with generated docs.

---

## 3. Transport

| | SSE + POST | WebSocket (`ws` 8.22, 204 kB; Socket.IO 4.8.4 with engine.io, 1.8 + 0.9 MB) | WebTransport | Long-polling |
|---|---|---|---|---|
| Idle RSS cost | none extra | `ws` +1 MB, Socket.IO +10 MB | needs HTTP/3, not offered by Fly's HTTP proxy | high request churn |
| Cookie on connect | native: the browser sends the `httpOnly` `SameSite=Lax` cookie with `EventSource` | sent on the upgrade request; manual check | unsupported in practice | native |
| Refusal codes (409, 429) | plain HTTP statuses | an error protocol of our own | n/a | plain HTTP |
| Reconnect | built into `EventSource` (`retry:`, `Last-Event-ID`), but see below | manual, or Socket.IO's | n/a | native |

- **Fly's proxy closes connections idle for about 60 s (Fact, community threads):** [60 s timeout](https://community.fly.io/t/60-second-timeout-for-http-server/1243),
  [60 s on SSE](https://community.fly.io/t/60s-timeout-on-server-sent-events/13152). The agent could not fetch
  Fly's official page (404). One thread from the past week reports a stalled stream reset at about 30 s on
  edge and Flycast hops, with `idle_timeout` having no effect; the resolution wasn't readable. Another shows a
  server-side `maxLifetime` close logged as a proxy error, reconnecting every 5 minutes
  ([write-up](https://ryanlabouve.com/writing/sse-streaming-on-fly/)). Hence a **15 s heartbeat**, not 25 s.
- **`EventSource` per the WHATWG spec:** reconnects on a network error or a clean end of body, sending
  `Last-Event-ID`; **fails permanently on any non-200 or wrong Content-Type**
  ([spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)). A 502 or 503 during a cold start
  or redeploy therefore kills an `EventSource` for good: re-create it when `readyState === CLOSED`, with backoff.
- **Same origin:** `withCredentials` is only needed cross-origin.
- **Auto-stop with an open SSE stream is unverified.** Fly's docs ([autostop](https://docs.fly.io/reference/fly-proxy-autostop-autostart))
  say a single machine stops when it has "no traffic"; community reports say open WebSocket and SSE connections
  don't reliably keep a machine alive ([thread](https://community.fly.io/t/auto-downscaling-closes-live-websocket-connections/14689));
  Fly now sends WebSocket GoAway frames before a stop ([announcement](https://community.fly.io/t/fly-proxy-now-gracefully-terminates-websocket-connections-before-stopping-suspending-a-machine/27544)).
  The earlier research ([realtime-on-fly](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/realtime-on-fly/docs/research/realtime-on-fly.md))
  said an open stream keeps the machine up; this is the open point to measure on first deploy.
- **Resync design (Judgement):** send a full snapshot as the first event on every connect and don't rely on
  `Last-Event-ID` replay, so cold starts and redeploys are safe.

**Judgement:** SSE plus typed POSTs. At a few pushes a minute and an intent every few seconds a WebSocket buys
nothing, and the ordered refusal chain needs HTTP statuses. **Flips if** continuous position sync returns.

---

## 4. Persistence

Versions (`npm view`, 2026-10-13): Node 24.21.0 (SQLite 3.53.4), better-sqlite3 13.0.3, drizzle-orm 0.45.4
(latest) and 1.0.0-rc.4 (rc tag), kysely 0.29.6, `prisma` CLI 8.0.0-rc.22 (latest tag) with
`@prisma/client` 7.10.0, libsql 0.5.29, lmdb 3.5.7, PGlite 0.5.9. Limits: `taskset -c 0`, a systemd scope with
`CPUQuota=25%` and `MemoryMax=256M`. fsync on WSL2 is not representative of Fly's NVMe.

### Engine

| | Facts | Verdict |
|---|---|---|
| **`node:sqlite`** | "Stability: 1.2 – Release candidate" since 24.15.0; no warning on `require` in 24.21.0; `backup()`, `function`, `aggregate`, sessions and `timeout` present; defensive mode on by default. 0 install. **10k check/apply/log transactions took 0.6–2 s** (`synchronous=NORMAL`), RSS about 61–63 MB against 42–48 MB for bare Node | Pick |
| better-sqlite3 13.0.3 | Same SQLite, same speed; 10k transactions 2.5–7 s (noisy). RSS 64–66 MB. 27 MB unpacked, 1 package, ships prebuilds. **`pnpm install` exits 1 with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds: {better-sqlite3: false}` is set in `pnpm-workspace.yaml`.** Prisma's adapter pins 12.x, which does need its build script | Runner-up |
| libSQL embedded | Bundled SQLite **3.45.1** (measured), 14 MB, 16 packages; adds nothing here | No |
| `bun:sqlite` | Not plausible with Node pinned | No |
| JSON or append-only files | Atomicity, indexing and migrations would be ours | No |
| LMDB 3.5.7 | K/V only; native addon with a build script; no SQL for the events log | No |
| PGlite 0.5.9 | **First query 4.8 s, 485 MB RSS**, 26 MB install: breaks the 256 MB cap | Rejected |

- **Blocking:** `DatabaseSync` blocks the loop per statement. About 0.04 ms per transaction at `NORMAL`;
  about 0.7 ms p50 per commit at `FULL` here, plus real fsync. Irrelevant for two players.
- **Crash test (Measured):** about 8 `kill -9` runs mid-transaction in WAL mode with `synchronous=FULL`
  (killed after "MID" printed with a half-written transaction open, and at random moments). Every run
  recovered with `integrity_check` = ok; the uncommitted half rolled back; the Voyage's sequence number
  always equalled the max event sequence; no acknowledged commit was lost; the `-wal` file (190–710 KB) was
  left and replayed on reopen.
- **WAL on a volume (Fact):** `-wal` and `-shm` must stay with the `.db`; auto-checkpoint at 1000 pages
  (about 4 MB); a clean close deletes both; WAL needs a same-host filesystem (Fly volumes are local). Set
  `journal_size_limit`.
- **Version trap (Fact):** the SQLite WAL-reset bug affects 3.7.0–3.51.2 and is fixed in 3.51.3. Node 24.21
  bundles 3.53.4.
- **Durability:** `FULL` fsyncs every accepted action. `NORMAL` is 4–5× faster in this run but can lose the
  last commits on power loss without corrupting the file.

### Access layer

| | Measured footprint | Notes |
|---|---|---|
| **Hand-written SQL, small runner, typed repository functions** | 0 dependencies | About 60 lines for the migration runner; 4 tables in about 30 lines of SQL |
| Drizzle 0.45.4 (stable) | 273 MB RSS on import, 152 MB heap | **No `node:sqlite` driver** (1.0 line only); needs better-sqlite3 |
| Drizzle 1.0.0-rc.4 + `node:sqlite` | 17 packages, 172 MB including `drizzle-kit` (esbuild build script blocked by default); **280 MB RSS on import** | Driver works: a typed JSON `$type` column, an insert and an `immediate` sync transaction passed `tsc` under Node's type stripping (2 files, 36 lines). rc.4 was 27 June; the docs "Upgrade to v1.0 RC" banner is still up |
| Kysely 0.29.6 | 2 packages, 3.6 MB, about 68 MB RSS | Types hand-written (6 lines); no built-in `node:sqlite` dialect; `begin` is deferred, so `BEGIN IMMEDIATE` is issued by hand |
| Prisma 7.10 + adapter-better-sqlite3 | 184 packages, 354 MB, 115 MB RSS | `allowBuilds: true` for 3 packages; no `node:sqlite` adapter; generated client; 36-line schema then `migrate deploy` |
| Typed-SQL generators | `sqlc` has no TypeScript generator on npm (none found); `typesql-cli` 0.24.0 depends on better-sqlite3, libsql, mysql2 and postgres | Not credible for five days |
| dbmate, umzug | dbmate is a Go binary; umzug 3.8.3 only orchestrates | Not needed |

- **Drizzle's memory:** the 280 MB is mostly V8 not collecting during import. With `--max-old-space-size=64`
  it dropped to 70 MB, and inside a 256 MB cgroup it ran at 82 MB. It fits, but only with a heap flag.
- **Draws (Judgement):** `draw TEXT NOT NULL CHECK(json_valid(draw))` plus `draw_version INT`, parsed with a
  zod schema per version on read. The events log gets `(voyage_id, id)` and `(actor, id)` indexes; a 100-row
  page query took about 1 ms over 10k rows.

### Backup

| | Notes |
|---|---|
| Fly daily snapshots | 5-day retention by default; free. The docs say nothing about database crash-consistency |
| `VACUUM INTO` or `backup()` | 13 ms on a 10k-row database, `integrity_check` ok |
| Litestream 0.5.17 | Maintained (31 Aug); needs object storage; overkill |

**Judgement:** `synchronous=FULL`, `busy_timeout`, a `VACUUM INTO` into `/data/backups/` at start and about
daily keeping three, and Fly's snapshots off-volume. Never copy the `.db` alone while the app runs. **Not
verified:** whether a Fly snapshot taken mid-write restores through WAL recovery; Fly NVMe fsync latency.

### Concurrency

One process, one connection, and a promise-chain mutex per Voyage id wrapping a synchronous
`BEGIN IMMEDIATE … COMMIT`. **Measured:** 2000 concurrent actions through the mutex gave a final counter of
exactly 2000; a naive read, `await`, write version of the same counter kept 1 of 200. With a single event
loop and a synchronous driver, JavaScript already serialises the block; `BEGIN IMMEDIATE` guards a second
machine, a migration at start or a future worker. A sequence-number check inside the transaction rejects
stale clients. Keep the read, the state write, the event insert and the pose upsert inside one synchronous
callback with no `await`.

---

## 5. Client

Vite 8.3.4, `vite build` defaults, minified; three 0.186.1. JS only, no three.js, for the UI table.

### UI layer

Test app: an `EventSource`-fed store, a Clock/Strikes readout, a profile list with POST buttons, and a canvas
mounted once by an imperative `mountScene()`. The same store and scene code backs every build.

| Layer (version) | raw KB | gzip KB | brotli KB | Imperative canvas mount |
|---|---|---|---|---|
| Vanilla TS + 30-line store | 2.3 | 1.2 | 1.0 | native |
| Solid 1.9.17 | 15.6 | 6.3 | 5.8 | `onMount` / `onCleanup`, no re-renders |
| Preact 11.0.1 (native, no compat) | 15.7 | 6.7 | 6.1 | `useRef` + `useEffect([])` |
| Lit 3.3.3 | 18.4 | 7.1 | 6.4 | `firstUpdated` |
| Svelte 5.57.2 | 40.5 | 15.7 | 14.3 | `bind:this` + `onMount` |
| Vue 3.5.44 | 64.3 | 25.2 | 23.0 | `ref` + `onMounted` |
| React 19.3.0 | 221 | 68.4 | 58.9 | `useRef` + `useEffect([])` |

Every layer kept the canvas alive across state updates; the canvas element was never touched by the list or
readout renders. Store wiring: React needs `useSyncExternalStore`, Preact a `useState` hook, Vue and Solid a
signal; Svelte 5 runes with a module-level `$state` store is the least code. **Not run:** AI-agent
code-quality per framework (React has the largest corpus, so Svelte 5 may get somewhat weaker output; this is
Judgement, not a measurement), `@testing-library/svelte` in jsdom, the Svelte plugin against Vite 8.

### 3D engine and collision

Hello-cube: a lit, rotating box plus a pointer raycast, tree-shaken.

| Engine | gzip KB | brotli KB | Notes |
|---|---|---|---|
| three.js 0.186.1 (MIT) | 132 | 108 | `Raycaster` built in; `GLTFLoader` opt-in from `three/addons` |
| Threlte 8.6.1 on three | 209 | 170 | about +76 KB over vanilla including Svelte; `three>=0.172`, `svelte>=5` |
| react-three-fiber 9.8.1 | 308 | 236 | includes React 19; peer `react <19.4` |
| Babylon 9.30.0 (Apache-2.0) | 396 (40 chunks) | 323 | deep imports; one 249 KB core chunk; `scene.pick` needs an explicit import |
| PlayCanvas 2.23.2 (MIT), `Application` | 525 | 406 | `sideEffects:false`, but `Application` pulls in everything |
| PlayCanvas, hand-assembled `AppBase` | 312 | not measured | after manually picking systems; hard to get right |
| Rapier (`rapier3d-compat`) | 1,670 | 1,196 | WASM embedded as base64; about 12× three |

Needle Engine: `@needle-tools/engine` is `6.0.0-alpha.7` as `latest`, no declared licence, Unity/Blender-centred
(not credible). Collision: walls and blocking tiles in Room data need an axis-separated AABB check against
the wall rectangles, which can be shared with the server and the 2D fallback and tested in Vitest with no
GPU. **Not measured:** mobile frame rate (bundle size only).

### Build tool and meta-framework

Idle RSS is the production server after start; loaded is after 300 sequential `GET /` plus 50 held SSE
clients. Each served `/`, an SSE route and a cookie-setting `POST /api/intent`; all handled SSE and the cookie.

| Option | Idle RSS | Loaded RSS | Notes |
|---|---|---|---|
| Plain `node:http` | 60 MB | 67 | baseline |
| Express 5 + static | 67 | 75 | |
| Hono (`@hono/node-server`) | 66 | 89 | |
| SvelteKit 3.0.1 + adapter-node 6.0.0 | 65 | 88 | build output 1.8 MB |
| Nuxt 4.6.1 / Nitro | 80 | 93 | SPA mode; output 2.5 MB |
| Astro 7.3.8 + `@astrojs/node` 11.1.7 | 94 | 106 | `dist` 0.55 MB; `node_modules` 146 MB |
| React Router 8.4.0 `react-router-serve` | 79 | 122 | |
| Next.js 16.4.0 standalone | 102 | 123 | standalone output 40 MB |
| TanStack Start 1.169.1 | not measured | not measured | pre-1.0 `latest`-tag churn |

Bundlers on the same three.js hello-cube (cold, 12 cores): esbuild 0.38 s and 136 KB gzip; Rsbuild 2.2.12 1.0 s
and 134 KB; Vite 8.3.4 1.2 s and 134 KB. Parcel (2.16.4, last published February 2026) was not measured.
All of these fit in 256 MB, but SQLite and each Voyage's state also need room, so a 60–90 MB baseline is
worth choosing over a 100–125 MB one.

**Judgement (all three):** Svelte 5, three.js with a plain `buildScene(roomData)`, no physics engine, a plain
Vite SPA with no meta-framework. Closest call: Svelte against Preact 11 (React is 50 KB gzip heavier but has
the largest corpus). SvelteKit in SPA mode (`ssr = false`, `+server.ts` routes) is the runner-up for the
build; reopen it if the 2D screens multiply.

---

## 6. Layout, tests, Playwright, image

Measured with Node 24.21.0, pnpm 11.9.0, Playwright 1.64.0 (Chromium 156), Vitest 5.0.4, three 0.186.1,
Vite 8.3.4, Docker Desktop 29.5.

### What the course harness constrains

- `checks.yml` runs `docker build -t app .`, then `docker run -d --init --name app -p 8080:8080 -e PORT=8080 --tmpfs /data app`,
  then `pnpm check` with `APP_URL=http://localhost:8080` (`tsc --noEmit` then `vitest run`; the vitest config
  includes only `spec/**/*.test.ts` and uses `spec/global-setup.ts`, which polls `APP_URL` every 200 ms for up
  to about 60 s). A red run blocks the deploy; the deploy job then `curl`s `https://<repo>.fly.dev/` up to 5
  times, 10 s apart, for a 200.
- **`c10/escape-room`'s `checks.yml` has no browser-install step** (`main` added `pnpm exec playwright install --with-deps chromium`). A Playwright spec fails on a clean runner without one.
  ubuntu-latest image 20261004 ships Chrome 154, Chromium 154, Node 24.21.0 cached and Docker 28.0.4
  ([runner-images](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md));
  WebGL on that preinstalled Chrome was **not verified** on a real runner.
- **`docker restart` and `docker stop` then `start` both wipe a tmpfs `/data` (Measured).** "Restart the app in
  CI and verify persistence" therefore can't restart the CI container: the spec has to spawn its own second
  server from source with a temporary `DATA_DIR`, as Dead Air's persistence spec did.
- **Node's type stripping refuses `.ts` files under `node_modules` (Measured:** `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
  A pnpm workspace package symlinked from its real path works; a `pnpm deploy` or injected copy lands in
  `node_modules/.pnpm` and breaks.
- `tsconfig.json` `include` is `["*.ts","spec","scripts"]` and must widen to `server`, `client`, `shared`.
  `.dockerignore` excludes `docs`, `GLOSSARY.md` and similar, but the image must still carry `README.md`.
- `scripts/check-evidence.ts` verifies every commit hash PROCESS.md cites as a markdown link, so a pushed
  branch commit is a citation that resolves.

### Layout

| Option | Facts | Fit |
|---|---|---|
| Single package, `server/ client/ shared/` | Dead Air did this: one Dockerfile, no workspace linking, spec imports `../shared/*.ts` | Fastest; no type-stripping trap |
| pnpm workspace | A real build boundary, but the `node_modules` trap above; a prod-only install for the image gets fiddly | Slower, more failure modes |
| Contract-first (zod 4.6.7, valibot 1.5.0, typebox 1.3.37, @orpc/server 1.15.6, hono 4.13.13) | Runtime validators, not a secrecy boundary | Orthogonal to the folder choice; oRPC and Hono RPC support SSE less simply than raw `fetch` + `EventSource` |

### Tests and time control

Vitest is already the harness runner; `node:test` would need a second runner and a CI step for no gain. Fake
timers can't reach an app running in another process or container. A test-only "set the time" endpoint works
against the CI container but is an unauthenticated clock in production if its gate fails. A **spawned child
server with a preload** has no production surface and also gives the restart test:
`node --import ./spec/fake-clock.ts server/index.ts` with `DATA_DIR=<tmp>` and a free port, the preload
overriding `Date.now` from an offset the test controls. One helper then serves Clock tests,
restart-persistence, previous-version Draw play-through and SSE-reconnect-on-restart. Add one spec asserting
`Date.now` isn't patched without the preload. Fly's auto-stop can't be tested in CI at all.

### Playwright and WebGL

| Setup | Measured |
|---|---|
| Default `chromium.launch()` (headless shell) | WebGL2 context created; renderer ANGLE/SwiftShader; launch 40 ms warm; 60 three.js renders in 28–190 ms; a 390×844, DPR 3, `isMobile`, `hasTouch` context works |
| `channel:'chromium'` (new headless) | WebGL2 OK; launch 100 ms warm, 2.6 s cold |
| Explicit `--use-gl=angle --use-angle=swiftshader` | Unnecessary; same result |
| Install, cold download | `playwright install --only-shell chromium` 12 s, 278 MB; full `chromium` 16 s, +403 MB |

Playwright 1.64's source adds `--enable-unsafe-swiftshader` itself on Linux (`coreBundle.js:44755`), so
Chrome 138's removal of the software-rendering fallback does not bite
([Chromium docs](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). Playwright's
docs advise against caching browsers (restore time is about the download time)
([CI docs](https://playwright.dev/docs/ci)). Puppeteer (similar, no built-in device profiles), Cypress and
WebdriverIO (their own runners) and Vitest browser mode (runs against a Vite-served page, not the deployed
app over `APP_URL`) were not run.

### Image and serving

Trivial Node HTTP server with one open SSE connection, `--cpus 0.25 --memory 256m --init`, five runs of
`docker run` to first HTTP 200 on Docker Desktop (a Linux host would be steadier):

| Base | Disk (content) | Cold start ms | Idle RSS |
|---|---|---|---|
| node:24.21.0-slim | 330 MB (81 MB) | 833, 586, 622, 572, 641 | 18 MiB |
| node:24.21.0-alpine | 242 MB (62 MB) | 773, 832, 883, 891, 893 | 19 MiB |
| distroless nodejs24-debian13 | 214 MB (55 MB) | 1065, 812, 994, 1699, 4078 (Docker Desktop hiccup) | 35 MiB |
| bun:1-slim (Bun 1.4.3) | 255 MB (74 MB) | 2058, 669, 794, 584, 654 | 18 MiB |

The differences are noise next to Docker's own overhead. `node:sqlite` is SQLite 3.53.4 on Node 24 and also
loads in Bun. Node SEA was not measured.

Compression of a 516 KiB three.js bundle (this host, un-throttled; roughly 4× slower on the throttled CPU):

| Method | Size | Cost per op |
|---|---|---|
| gzip -6 | 127 KiB | 8.5 ms |
| gzip -1 | 151 KiB | 3.9 ms |
| brotli q4 | 127 KiB | 7.1 ms |
| brotli q11 (build time) | 104 KiB | 638 ms |
| read a precompressed `.br` | 104 KiB | 0.05 ms |

PID 1 and signals: with a `SIGTERM` handler that ends the SSE responses and closes the server, `docker stop`
took 382 ms with one SSE connection open; with no handler and Node as PID 1 it took 10.35 s (SIGKILL after
the timeout). CI uses `--init`; **Fly does not**, so the app must handle `SIGTERM` and `SIGINT` itself,
ending SSE streams and checkpointing the WAL.

**Judgement:** stay on `node:24.21.0-slim` (matches `mise.toml` and CI's Node exactly, has glibc and a shell);
serve `dist/` from the Node process; precompress `.br` and `.gz` at image build and negotiate
`Content-Encoding`; hashed assets `Cache-Control: public, max-age=31536000, immutable`, `index.html`
`no-cache`; no Caddy sidecar (extra memory and a process manager for nothing).

---

## What is still unknown

- Real Fly numbers: cold start, image pull and volume mount time, NVMe fsync latency, shared-CPU throttling.
- Whether an open SSE stream keeps the auto-stop machine awake (docs and community disagree).
- Whether a Fly snapshot taken mid-write restores through WAL recovery.
- How well an agent writes Svelte 5 against React; mobile frame rates; Svelte's plugin against Vite 8;
  `@testing-library/svelte` in jsdom.
- WebGL in headless Chromium on a real GitHub runner (and on its preinstalled Chrome).
- Hono's streaming under `@hono/node-server` (heartbeat, backpressure), beyond a disconnect-detection check.
- Not tested: `@fastify/sse` and `better-sse` quality, uWebSockets.js (GitHub-only install), a Kysely
  `node:sqlite` dialect (only `@xmcl/sqlite 0.0.3` by name search), Drizzle RC `drizzle-kit` quirks with
  `node:sqlite`, Node SEA, Parcel, TanStack Start's memory.

## Sources

Node: [sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html) ·
SQLite: [WAL](https://sqlite.org/wal.html) · Drizzle: [node:sqlite](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite),
[1.0 status](https://github.com/drizzle-team/drizzle-orm/issues/5660) · Kysely: [getting started](https://kysely.dev/docs/getting-started),
[node:sqlite thread](https://github.com/kysely-org/kysely/issues/1292) · Fly: [volumes](https://docs.fly.io/volumes/volume-manage),
[autostop](https://docs.fly.io/reference/fly-proxy-autostop-autostart) and the community threads linked in section 3 ·
[Litestream releases](https://github.com/benbjohnson/litestream/releases) · [Hono streaming](https://hono.dev/docs/helpers/streaming) ·
[WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) · [Playwright CI](https://playwright.dev/docs/ci) ·
[Chromium SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md) ·
[runner-images](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) ·
[three.js](https://github.com/mrdoob/three.js), [Threlte](https://threlte.xyz), [react-three-fiber](https://github.com/pmndrs/react-three-fiber),
[Babylon.js](https://www.babylonjs.com), [PlayCanvas](https://playcanvas.com), [Rapier](https://github.com/dimforge/rapier.js),
[SvelteKit](https://github.com/sveltejs/kit). Package versions from `npm view` on 2026-10-13.
