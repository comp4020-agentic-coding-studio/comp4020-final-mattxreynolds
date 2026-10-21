// Spawns a private server process for specs that need test hooks or a
// restart (the main app at APP_URL has neither in CI). Each server gets a free
// port, a temp SQLite file and quiet logs. Every spawned process is tracked and
// SIGKILLed when the test worker exits, even if a spec forgets or times out.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestServer = {
  url: string;
  dbPath: string;
  /** Sends `signal` (default SIGTERM) and waits for the process to exit. */
  stop(signal?: NodeJS.Signals): Promise<void>;
  /** SIGKILL: no graceful flush. */
  kill(): Promise<void>;
  /** Starts the server again on the same port and database file
   * (stopping it gracefully first if it is still running). */
  restart(): Promise<void>;
  /** Kills the process if running and removes its temp directory. */
  dispose(): Promise<void>;
};

const running = new Set<ChildProcess>();
process.once("exit", () => {
  for (const p of running) p.kill("SIGKILL");
});

export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

async function waitHealthy(url: string, proc: ChildProcess, output: () => string, ms = 20000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`server exited early (${proc.exitCode}):\n${output()}`);
    try {
      const res = await fetch(new URL("/healthz", url));
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server at ${url} never became healthy:\n${output()}`);
}

function exited(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => proc.once("exit", () => resolve()));
}

export async function startServer(opts: { dbPath?: string; testHooks?: boolean } = {}): Promise<TestServer> {
  const dir = opts.dbPath ? null : mkdtempSync(join(tmpdir(), "btw-spec-"));
  const dbPath = opts.dbPath ?? join(dir!, "db.sqlite");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let proc: ChildProcess | null = null;
  let out = "";

  const launch = async (): Promise<void> => {
    out = "";
    const p = spawn(process.execPath, ["server/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        DATABASE_PATH: dbPath,
        LOG_QUIET: "1",
        ENABLE_TEST_HOOKS: opts.testHooks ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout!.on("data", (d) => (out += d));
    p.stderr!.on("data", (d) => (out += d));
    running.add(p);
    p.once("exit", () => running.delete(p));
    proc = p;
    try {
      await waitHealthy(url, p, () => out);
    } catch (err) {
      proc = null;
      p.kill("SIGKILL");
      throw err;
    }
  };

  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
    const p = proc;
    if (!p) return;
    proc = null;
    const done = exited(p);
    p.kill(signal);
    // a graceful stop that hangs is a bug, but never let it hang the suite
    const t = setTimeout(() => p.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(t);
  };

  try {
    await launch();
  } catch (err) {
    if (dir) rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    url,
    dbPath,
    stop,
    kill: () => stop("SIGKILL"),
    restart: async () => {
      await stop();
      await launch();
    },
    dispose: async () => {
      await stop("SIGKILL");
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
