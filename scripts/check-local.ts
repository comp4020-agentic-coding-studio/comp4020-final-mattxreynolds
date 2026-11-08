#!/usr/bin/env node
// Builds the client, starts a throwaway production server (free port, temp
// DB, test hooks on) and runs `pnpm check` against it, then stops it.
// `pnpm check` itself is the course's command and needs an app already
// running at APP_URL; this wraps it for a one-command local run.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

if (!process.argv.includes("--no-build")) execFileSync("pnpm", ["build"], { stdio: "inherit" });

const port = await freePort();
const dir = mkdtempSync(join(tmpdir(), "btw-check-"));
const server = spawn("node", ["server/index.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOST: "127.0.0.1",
    DATABASE_PATH: join(dir, "db.sqlite"),
    ENABLE_TEST_HOOKS: "1",
    LOG_QUIET: "1",
  },
  stdio: "inherit",
});

let code = 1;
try {
  const extra = process.argv.slice(2).filter((a) => a !== "--no-build");
  execFileSync("pnpm", ["check", ...(extra.length ? ["--", ...extra] : [])], {
    stdio: "inherit",
    env: { ...process.env, APP_URL: `http://127.0.0.1:${port}`, APP_TEST_HOOKS: "1" },
  });
  code = 0;
} catch {
  code = 1;
} finally {
  server.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
