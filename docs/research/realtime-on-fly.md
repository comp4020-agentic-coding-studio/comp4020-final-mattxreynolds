# Real-time transport and persistence on the course Fly setup

Research for [#6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/6),
part of the planning map [#2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/2).
Gathered 2026-10-13.

**The fixed shape** (`fly.toml`, `Dockerfile`): one `shared-cpu-1x` machine
with 256 MB in `syd`. One volume mounted at `/data`. `auto_stop_machines = "stop"`,
`auto_start_machines = true`, `min_machines_running = 0`. Fly's proxy
terminates TLS, and the app serves plain HTTP on `$PORT` (8080). The image is
Node 24.21 slim, and no `[http_service.concurrency]` block is set.

**Labels:** **Fact** means a primary source says it, with a link.
**Measured** means I ran it myself on 2026-10-13. **Judgement** is my
recommendation, which the sources don't settle.

---

## Answer in brief

- **Transport: SSE for server→client, plain POST for actions.** That's what
  Dead Air (C8) already runs on this exact setup. WebSockets also work, but
  need the `ws` package and buy nothing a turn-based co-op puzzle needs.
  Polling at about 1 s is the only option that costs real CPU on a 6.25%
  baseline. Whichever you pick, send a heartbeat every 15–25 s, and write
  client code that recovers when the browser gives up reconnecting.
- **Auto-stop:** an open stream is the reason a machine stays up. It stops
  a few minutes after the last tab closes and wakes on the next request
  (about 4 s cold, 0.05 s warm, measured). The docs never say outright
  whether an idle open connection counts as load. Plan for the stream to be
  cut at any time (stop, redeploy, crash) and to come back.
- **Capacity:** the showcase is nowhere near any limit. 1000 open SSE streams
  added about 30 MB RSS (measured). A room of two-player Teams is under
  100 connections. CPU, not memory, is the tight resource: 5 ms in every
  80 ms, plus a burst balance.
- **Persistence: keep `node:sqlite` (built in, release candidate in Node 24.15+)
  with WAL on `/data`.** Write through on every state change. It survives
  restarts and redeploys, because the volume is local NVMe that stays with
  the machine. An ORM is optional: Drizzle supports `node:sqlite` directly,
  while Prisma 7 needs the `better-sqlite3` adapter.
- **C10 logs: both.** Write the who-did-what record to SQLite as the record
  of truth, and print one structured line per action to stdout so
  `flyctl logs` shows it live. `flyctl logs` only reads a recent buffer that
  drains when the app is idle, and Fly's log search keeps 7 days. Stdout
  alone won't reliably outlive the crit.

---

## 1. Transport behind Fly's proxy

### 1.1 Proxy timeouts

- **Fact.** Fly staff (jerome, 2021): *"There is a 60 idle timeout. If no
  data is received or sent within 60 seconds, the connection will be
  closed."* A later edit to the same post says there isn't an idle timeout
  any more, and that it's "not well documented (if at all)."
  [community.fly.io/t/1243/2](https://community.fly.io/t/60-second-timeout-for-http-server/1243/2)
- **Fact.** `fly.toml` has `http_options.idle_timeout` ("Configure an
  idle-timeout for connections to your app"). The reference gives no default.
  [docs.fly.io/reference/configuration](https://docs.fly.io/reference/configuration)
- **Fact.** Fly support, 2026-10-08: the proxy sets `TCP_USER_TIMEOUT` to
  30 s, and it isn't configurable. It fires when a slow reader holds the TCP
  window at zero for about 30 s, which is backpressure, not idleness. A
  user's `idle_timeout = 600` had no effect on it.
  [community.fly.io/t/28755](https://community.fly.io/t/fly-proxy-resets-a-stalled-http-stream-after-30s-on-edge-and-flycast-hops-http-options-idle-timeout-has-no-effect/28755)
- **Fact.** The HTML standard advises that proxies may drop idle HTTP
  connections, so authors "can include a comment line (one starting with a
  ':' character) every 15 seconds or so."
  [html.spec.whatwg.org §9.2](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- **Fact (repo).** Dead Air's SSE handler writes `: keep-alive` every 25 s
  (`server/rooms.ts`). PROCESS.md records that SSE "passes through Fly's
  proxy" on the deployed C8 build.
- **Judgement.** Treat 60 s idle as the ceiling, and heartbeat every
  15–25 s whatever the transport. The 30 s stall timer only matters if a
  client stops reading, such as a backgrounded phone tab. The cure is the
  same: let the connection die and reconnect.
- **Fact (Node).** Node's HTTP server doesn't impose a socket inactivity
  timeout by default (`server.timeout` is 0 since v13). `requestTimeout`
  (300 s) only bounds receiving the request, so a long-lived SSE response
  isn't cut by Node.
  [nodejs.org http.Server](https://nodejs.org/docs/latest-v24.x/api/http.html#servertimeout)
  **Measured:** on Node 24.21, a fresh `http.Server` reports `timeout: 0`,
  `requestTimeout: 300000`, `headersTimeout: 60000`, `keepAliveTimeout: 5000`.

### 1.2 Reconnects

- **SSE, fact.** `EventSource` reconnects by itself after an
  "implementation-defined" delay, "probably in the region of a few seconds".
  The server can set the delay with `retry:`, and the browser sends
  `Last-Event-ID` when it reconnects. But if a response is not 200 or not
  `text/event-stream`, the browser fails the connection, and "once the user
  agent has failed the connection, it does not attempt to reconnect."
  [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)
  - **Judgement.** That last rule is the trap on Fly. If a reconnect lands
    while the machine is stopped or mid-redeploy and the proxy answers with
    an error status, `EventSource` goes `CLOSED` for good. Client code has to
    watch for `readyState === CLOSED` and create a new one with backoff.
    Dead Air's `client/src/useRoom.ts` already does this. Since every message
    is a full room view (Dead Air does this too), a reconnect needs no
    replay: just send the current state on connect.
- **WebSockets, fact.** The browser API has no auto-reconnect. Node has a
  stable *client* `WebSocket` global (v22.4+) but no built-in server, so the
  server needs a library such as `ws`.
  [Node globals](https://nodejs.org/docs/latest-v24.x/api/globals.html#websocket)
  `ws` recommends a server-side ping every 30 s to detect dead peers, and
  ships with permessage-deflate *off* on the server because of "significant
  overhead in terms of performance and memory".
  [ws README](https://github.com/websockets/ws/blob/master/README.md)
  - **Fact.** Since April 2026, fly-proxy sends a WebSocket close frame to
    open sockets before it stops or suspends a machine, so clients get "a
    signal to reconnect elsewhere".
    [community.fly.io/t/27544](https://community.fly.io/t/fly-proxy-now-gracefully-terminates-websocket-connections-before-stopping-suspending-a-machine/27544)
    (There's only one machine here, so "elsewhere" means the same machine
    after it wakes.)
- **Polling.** Nothing to reconnect. Each poll is an ordinary request that
  wakes a stopped machine.

### 1.3 Interaction with `auto_stop_machines = "stop"`

- **Fact.** The proxy's stop loop "runs every few minutes and stops at most
  one Machine per region per pass". For a single machine, "if the Machine has
  no traffic (a load of 0), then the proxy stops or suspends the Machine."
  Load is judged against the concurrency `soft_limit`.
  [autostop-autostart](https://docs.fly.io/launch/autostop-autostart),
  [reference](https://docs.fly.io/reference/fly-proxy-autostop-autostart)
- **Fact.** Concurrency `type` defaults to `connections` when unspecified,
  and `soft_limit` defaults to 20. This repo sets neither.
  [configuration](https://docs.fly.io/reference/configuration)
- **Fact.** Autostart: the proxy "waits for a request", starts a stopped
  machine, and routes the request to it.
  [reference](https://docs.fly.io/reference/fly-proxy-autostop-autostart)
- **Measured.** Against the deployed C8 app (`/api/health`, from the
  developer's machine): the first request took 3.8 s (a cold start,
  presumably), and the next took 0.05 s. The edge spoke HTTP/2. One sample
  only.
- **Unsettled in the sources.** The docs never say in so many words whether
  an open but quiet SSE stream or WebSocket counts as load. With the default
  `type = "connections"`, an open connection is a connection, so the
  natural reading is that it keeps the machine up. PROCESS.md says the C8
  build saw exactly that ("an open tab keeps the machine awake"). There's
  also an unanswered 2024 report of a machine stopped under a 4-hour-old
  WebSocket ([t/19900](https://community.fly.io/t/server-auto-scaling-despite-websocket-connection/19900)),
  and the April 2026 close-frame change implies stops with open sockets do
  happen.
- **Judgement, by transport:**
  - SSE or WebSocket: the machine stays up while any tab is open, and stops
    a few minutes after the last closes. One forgotten tab costs cents.
    Design so that a stop under an open tab is harmless anyway.
  - Polling: each poll is a request, so a poll interval shorter than the
    stop loop keeps it awake just the same. There's no auto-stop advantage.
  - The marker's next-day visit is a cold start. The first request waits
    about 4 s, and state must come from SQLite (section 3).

### 1.4 Verdict

| | SSE + POST | WebSocket (`ws`) | Polling ~1 s |
| --- | --- | --- | --- |
| Meets ~1 s | yes, push | yes, push | only just; latency is up to the poll interval plus the round trip |
| Extra deps | none (Express `res.write`) | `ws`, plus upgrade wiring | none |
| Reconnect | built in, but goes dead after an error status, so handle `CLOSED` | hand-written | n/a |
| Heartbeat | `:` comment every 15–25 s | ping every ~25 s | n/a |
| CPU on 6.25% baseline | event-driven, near zero idle | event-driven, near zero idle | constant: N clients × 1 req/s through Express |
| Keeps machine awake | while a tab is open | while a tab is open | while a tab is open |
| Proven on this setup | yes (C8) | not here | not here |

**Judgement: SSE + POST.** A co-op puzzle's traffic is discrete intents from
the client and state pushes from the server. That's exactly SSE's shape, and
it's already proven on this setup. Pick WebSockets only if a design needs
client→server streams at high rates (continuous cursor or position sharing,
voice signalling). Even then it's a `ws` dependency, not a platform problem.

---

## 2. Memory and connection budget on 256 MB

- **Fact.** Fly: "256MB is enough to run small applications with few users."
  [docs.fly.io/js/the-basics/scaling](https://docs.fly.io/js/the-basics/scaling)
- **Fact.** Fly machines are Firecracker VMs. On a VM this small, Node's
  default heap ceiling comes from total RAM. Community answers recommend
  setting `NODE_OPTIONS=--max-old-space-size=…` explicitly on small VMs, and
  pairing it with `swap_size_mb` if you add swap.
  ([scaling](https://docs.fly.io/js/the-basics/scaling),
  [community](https://community.fly.io/t/fatal-error-reached-heap-limit-allocation-failed-javascript-heap-out-of-memory/19671))
  Judgement: `swap_size_mb` is a change to the shape the course watches, so
  ask before adding it. `--max-old-space-size` around 160–180 is an `[env]`
  setting, and only worth it if memory ever climbs.
- **Measured** (Node 24.21, Linux x64, plain `node:http`, 2026-10-13, script
  in the appendix). Baseline RSS was 60 MB with a 6.7 MB heap. 100 open SSE
  streams receiving a ~550 B message every second came to 66 MB RSS. 1000
  streams came to 91 MB RSS and a 12.5 MB heap, so about **30 KB per open
  stream**. Express, the room cache and SQLite add a few tens of MB on top
  of the baseline (judgement, not measured).
- **Fact.** CPU: `shared-cpu-1x` gets "5ms (6.25%)" of every 80 ms, plus a
  burst balance. A new machine starts with 5 s of balance, capped at 500 s.
  It runs at up to 100% while bursting, and is throttled to the baseline
  once the balance is spent.
  [cpu-performance](https://docs.fly.io/machines/cpu-performance/)
- **Fact.** With one machine and no `hard_limit` set, the proxy never refuses
  traffic for concurrency. `soft_limit` only steers traffic between machines
  and drives autostop.
  [configuration](https://docs.fly.io/reference/configuration)
- **Judgement, showcase budget.** Say 15–25 Teams of two, some with a
  second tab: under 100 streams, about 3 MB of connection memory. Room
  state is a few KB per Team, so even thousands of rooms in memory are
  under 10 MB. The real constraint is CPU:
  - Push only on change (an action, a tick that changes something), never
    on a fixed per-client loop. Send deadlines (`endsAt`) and let clients
    render countdowns locally, as Dead Air does.
  - Polling at 1 s across 50 clients is 50 Express requests a second, each
    with a SQLite or JSON hit. That could eat the 6.25% baseline and run
    down the burst balance over a two-hour showcase. This is the strongest
    argument against polling.
  - No server-side physics, 3D or rendering. Anything heavy belongs in the
    browser.
  - The browser's HTTP/1.1 limit of about 6 connections per host doesn't
    bite. The Fly edge served HTTP/2 (measured), which multiplexes streams,
    and the marker's two Chrome profiles have separate connection pools
    anyway.

---

## 3. Persistence on one `/data` volume, no DB server

### 3.1 What the volume guarantees

- **Fact.** "A Fly Volume is a slice of an NVMe drive on the same physical
  server as the Machine", and "it is not network storage". It's for "any
  information that needs to persist after deploy or restart", whereas "the
  root file systems of a Fly Machine are ephemeral". One volume attaches to
  one machine at a time.
  [volumes/overview](https://docs.fly.io/volumes/overview/)
- **Fact.** Daily block snapshots, kept 5 days by default (configurable from
  1 to 60). "Daily automatic snapshots may not have your latest data." Fly
  warns that a single machine and volume "leaves you at risk for downtime
  and data loss".
  [volumes/overview](https://docs.fly.io/volumes/overview/)
- **Fact.** `canary` and `bluegreen` deploys can't be used with volumes, so
  `rolling` (the default) is what runs. Release commands run "in a temporary
  Machine with no volumes".
  [configuration](https://docs.fly.io/reference/configuration)
  - **Judgement.** A redeploy replaces the one machine with no overlap:
    streams drop, there's a few seconds of downtime, and clients reconnect.
    Schema migrations can't be a `release_command`. Run them at app start
    (`CREATE TABLE IF NOT EXISTS`, or an ORM migrator called from
    `server/index.ts`).
- **Fact.** On shutdown, Fly sends `SIGINT` by default, with a `kill_timeout`
  of 5 s (up to 300 s), and warns that this is best-effort.
  [configuration](https://docs.fly.io/reference/configuration)

### 3.2 SQLite in WAL mode on that volume

- **Fact.** `journal_mode=WAL` is persistent: once set, it stays across
  reopens. WAL requires all processes on one host and doesn't work over a
  network filesystem. A local NVMe volume meets that.
  [sqlite.org/wal.html](https://www.sqlite.org/wal.html)
- **Fact.** Crash and kill safety: if the last connection doesn't close
  cleanly, the `-wal` file stays, and the next open runs recovery. The WAL
  "is part of the persistent state of the database", so keep `-wal` beside
  the `.db` and never delete it by hand. A clean close checkpoints and
  removes it.
  [sqlite.org/wal.html](https://www.sqlite.org/wal.html)
- **Fact.** Durability: with `synchronous=FULL`, the WAL is synced on every
  commit. With `NORMAL`, recent commits "might rollback following a power
  failure or hard reset", though not after a mere process crash. Automatic
  checkpoints run at 1000 pages (about 4 MB).
  [sqlite.org/wal.html](https://www.sqlite.org/wal.html)
- **Fact.** That page notes a WAL-reset corruption bug in 3.7.0–3.51.2, fixed
  in 3.51.3. **Measured:** Node 24.21's bundled SQLite is 3.53.4
  (`process.versions.sqlite`), so it isn't affected.
- **Judgement.** One process and one connection, writing through on each
  change, is the simplest correct design. A process killed after
  `kill_timeout` loses nothing that was committed. A `SIGINT` handler that
  calls `db.close()` is tidy but not required. Keep the default
  `synchronous` (FULL): the write rate is a handful a second at most.

### 3.3 Library options

| Option | Status / facts | Fit here (judgement) |
| --- | --- | --- |
| **`node:sqlite`** (`DatabaseSync`) | Built in. "Stability: 1.2 – Release candidate" since v24.15.0, unflagged since v22.13 / v23.4. Fully synchronous API. Async `backup()` since v23.8. No runtime warning seen on 24.21 (measured). [Node docs](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) | **Default.** Zero dependencies, no native build, already in use by Dead Air. The image pins Node 24.21, past the RC mark. |
| **better-sqlite3** 13.0.3 | Synchronous API with a long track record. Native addon, but v13 ships `prebuilds/` in the package and has no install script, so it works with pnpm's default script blocking and the Dockerfile's `--ignore-scripts`. Requires Node ≥ 22. (`npm view better-sqlite3`, [repo](https://github.com/WiseLibs/better-sqlite3)) | Fine, but adds a native dependency for no gain over `node:sqlite`. Mainly relevant as Prisma's adapter. |
| **Drizzle** | "Native support for SQLite connections with the `libsql`, `node:sqlite` and `better-sqlite3` drivers". `node:sqlite` via `drizzle-orm/node-sqlite`, currently on the `drizzle-orm@rc` tag. [Drizzle docs](https://orm.drizzle.team/docs/get-started-sqlite) | Typed schema and queries on top of `node:sqlite`, if wanted. The RC tag is a mild risk. Run migrations at start. |
| **Prisma 7** | Local SQLite through a driver adapter: `@prisma/adapter-better-sqlite3` with `new PrismaBetterSqlite3({ url })`. [Prisma SQLite docs](https://www.prisma.io/docs/orm/overview/databases/sqlite) | Familiar stack, but heavy for 256 MB: a generated client plus a CLI for migrate, which can't run as a release command (no volume). Judgement: more moving parts than the problem needs. |
| **Flat JSON files** | No library. Durability is on you: write a temp file, `fsync`, `rename`. | Workable for one blob per room, but you hand-roll atomicity and lose queries (C10 logs, stats). SQLite is strictly better here. |

---

## 4. Where C10's who-did-what logs should live

- **Fact.** "Fly.io app logs are the stdout from the processes run in your
  apps." Fly's Grafana log search "retains logs for 7 days".
  [logging-overview](https://docs.fly.io/monitoring/logging-overview/)
- **Fact.** `fly logs` "prints the most recent app logs and then tails the
  current logs in real-time". `--no-tail` fetches "the logs in the buffer".
  There's no time-range flag, and the buffer size isn't documented.
  [live-tail-logs](https://docs.fly.io/monitoring/live-tail-logs/),
  [flyctl logs](https://docs.fly.io/flyctl/logs/)
- **Fact.** A flyctl PR merged on 2026-09-30 calls an empty buffer "the normal
  state for a freshly launched app or one that has been idle for a while",
  that is, an app "idle long enough for its buffer to drain".
  [superfly/flyctl#5254](https://github.com/superfly/flyctl/pull/5254)
- **Fact.** Longer retention means exporting with the Fly Log Shipper
  (Vector) to an outside service, which is a second app and outside the
  course shape.
  [logging-overview](https://docs.fly.io/monitoring/logging-overview/)
- **Judgement: both, with SQLite as the record of truth.**
  1. Add an append-only `events` table in the same SQLite file, with time,
     room or attempt, player tag and callsign, role, action, result
     (accepted, refused and why), and state version. It survives restarts,
     redeploys and auto-stop, and can feed in-app history.
  2. Print one line per action to stdout as JSON. That way `flyctl logs`
     shows who did what live during the crit, and Grafana search covers
     the next 7 days.
  3. For "outlives the crit" through `flyctl`, add a small script reachable
     with `flyctl ssh console -C "node scripts/print-events.ts …"` that
     prints the table. `ssh console` needs a running machine; any request
     starts one. The `node:24-slim` image has no `sqlite3` CLI, so the
     script uses `node:sqlite`.
  - Log refusals as well as successes. Server-side checks on what each
    Player may change are a C10 requirement, and a refused action is the
    evidence they work.
  - Logging cost is trivial: one INSERT plus one `console.log` per action.

---

## Appendix: measurement script

`/tmp/sse-bench/` (not committed): a `node:http` server holding SSE
responses in a `Set`, writing about 550 B to each every second, with `/mem`
returning `process.memoryUsage()` after `gc()`. A driver opened 100, then
1000, keep-alive connections from a separate process and read `/mem` after
4 s. Results are in section 2.

## Sources

- Fly: [autostop-autostart](https://docs.fly.io/launch/autostop-autostart) ·
  [autostop reference](https://docs.fly.io/reference/fly-proxy-autostop-autostart) ·
  [fly.toml reference](https://docs.fly.io/reference/configuration) ·
  [volumes](https://docs.fly.io/volumes/overview/) ·
  [CPU performance](https://docs.fly.io/machines/cpu-performance/) ·
  [JS scaling](https://docs.fly.io/js/the-basics/scaling) ·
  [logging overview](https://docs.fly.io/monitoring/logging-overview/) ·
  [live tail](https://docs.fly.io/monitoring/live-tail-logs/) ·
  [flyctl logs](https://docs.fly.io/flyctl/logs/) ·
  [flyctl#5254](https://github.com/superfly/flyctl/pull/5254)
- Fly community: [60 s idle timeout (staff, 2021)](https://community.fly.io/t/60-second-timeout-for-http-server/1243/2) ·
  [TCP_USER_TIMEOUT 30 s (support, 2026)](https://community.fly.io/t/fly-proxy-resets-a-stalled-http-stream-after-30s-on-edge-and-flycast-hops-http-options-idle-timeout-has-no-effect/28755) ·
  [WebSocket close frame before stop (staff, 2026)](https://community.fly.io/t/fly-proxy-now-gracefully-terminates-websocket-connections-before-stopping-suspending-a-machine/27544) ·
  [stop despite open WebSocket (unanswered)](https://community.fly.io/t/server-auto-scaling-despite-websocket-connection/19900) ·
  [Node heap OOM](https://community.fly.io/t/fatal-error-reached-heap-limit-allocation-failed-javascript-heap-out-of-memory/19671)
- Web platform: [WHATWG server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- Node: [node:sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) ·
  [WebSocket global](https://nodejs.org/docs/latest-v24.x/api/globals.html#websocket) ·
  [http.Server timeouts](https://nodejs.org/docs/latest-v24.x/api/http.html#servertimeout)
- SQLite: [Write-Ahead Logging](https://www.sqlite.org/wal.html)
- Libraries: [ws README](https://github.com/websockets/ws/blob/master/README.md) ·
  [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) ·
  [Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite) ·
  [Prisma SQLite (v7)](https://www.prisma.io/docs/orm/overview/databases/sqlite) ·
  [pnpm build settings](https://pnpm.io/settings/build)
