import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SecondServer {
  url: string;
  dataDir: string;
  /** Everything the server has printed to stdout so far. */
  output(): string;
  /** Sends SIGTERM and resolves with the exit code once the process is gone. */
  stop(): Promise<number | null>;
}

// Starts the server from source, as the image runs it, on a port the OS picks
// (PORT=0) with its own DATA_DIR and an optional frozen clock. Restart, Clock
// and Away checks use this because the CI container's /data is a tmpfs.
export async function startSecondServer(
  options: { dataDir?: string; now?: number; ticking?: boolean } = {},
): Promise<SecondServer> {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "second-server-"));
  const env: Record<string, string | undefined> = { ...process.env, PORT: "0", DATA_DIR: dataDir };
  if (options.now !== undefined) env.FAKE_NOW = String(options.now);
  if (options.ticking) env.FAKE_TICKS = "1"; // the fake time then runs on at real speed from `now`
  const child: ChildProcess = spawn(
    process.execPath,
    ["--import", "./spec/fake-clock.ts", "server/index.ts"],
    { env, stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

  let out = "";
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout!.on("data", (chunk: Buffer) => {
      out += chunk;
      const found = out.match(/listening on port (\d+)/);
      if (found) resolve(Number(found[1]));
    });
    void exited.then((code) => reject(new Error(`second server exited early (${code}): ${out}`)));
  });

  return {
    output: () => out,
    url: `http://127.0.0.1:${port}`,
    dataDir,
    async stop() {
      child.kill("SIGTERM");
      return exited;
    },
  };
}
