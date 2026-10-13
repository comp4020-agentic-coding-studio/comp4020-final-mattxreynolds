# The server is Hono on Node 24, running TypeScript source directly

The server owns the rules, the SSE streams, the session cookie and SQLite, on one 256 MB shared-CPU machine, and has to start from cold after Fly auto-stops it. We chose Node 24.21 (the version `mise.toml` and CI already pin) running `server/index.ts` through Node's built-in type stripping, with no compile step, and Hono on `@hono/node-server` as the framework. Request checks run as hand-ordered middleware (401, 403, 403, 409, then zod on the body, then throttle), so a validation failure can never outrank an authorisation failure.

The measurements are relative (a WSL2 box under a 25% CPU quota and a 256 MB cap, not Fly) and the evidence is in [the stack comparison](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/stack-comparison/docs/research/stack-comparison.md).

## Considered Options

- **Bun:** about a third of Node's memory (31 vs 88 MB idle with a framework) and 4–8× faster to start. Rejected because every option fits in 256 MB, Fly's own cold start (about 4 s) dwarfs the gap, Bun's default 10 s `idleTimeout` silently kills SSE sockets, and Playwright, Vitest and the course CI all run on Node, so the spec helper that starts a second server would need Bun in CI as well.
- **Deno:** in between on memory, with noisy cold starts (0.4–2.9 s), a permissions model and isolated `node_modules` to work around. No advantage that decides anything.
- **Express 5:** the runner-up, and Dead Air ran SSE on this exact Fly setup without a recorded failure. Rejected on weight (65 packages against Hono's 2) and because cookies, validation and SSE all need separate packages. This is the closest call. **If the day-one SSE spike shows a streaming or backpressure bug in Hono, switch to Express.**
- **Fastify 5:** validates before the handler and returns 400, which would put a 400 ahead of the 401/403/409 order fixed in [Who is a person, and what may each Player see and change?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/11). Its SSE needs `reply.hijack()` or a pre-1.0 plugin.
- **Elysia:** Bun-first, and returns 422 on validation errors by default.
- **Plain `node:http`:** leanest, but routing, bodies and cookies are hand-written for no gain over Hono's two packages.
- **Compile to JavaScript in the Dockerfile:** recovers about 16 MB and 200 ms of start-up. Rejected because it adds a build step that can drift from what the tests ran (Dead Air's one stack-shaped bug was a stale production build), and the CI spec helper runs the same `.ts` source the image runs.

## Consequences

- Type stripping allows erasable syntax only: no enums, parameter properties or runtime namespaces, and imports carry `.ts` extensions. `tsc` runs with `erasableSyntaxOnly` so the compiler catches it.
- Node refuses `.ts` files under `node_modules`, so shared code can't be a workspace package ([ADR 0007](0007-one-package-answers-stay-under-server.md)).
- Hono wraps Node streams in web streams, so heartbeat, disconnect cleanup and backpressure are tested first, before anything else is built on them.
- Fly doesn't run the container with `--init`, so the server handles `SIGTERM` itself: end the SSE streams, checkpoint the WAL, close the server. Without a handler a stop took 10.35 s against 382 ms with one.
- `node:sqlite` is a release candidate, so the Node version is pinned and a Node bump is a reviewed change ([ADR 0005](0005-sqlite-hand-written-sql-serialised-per-voyage.md)).
