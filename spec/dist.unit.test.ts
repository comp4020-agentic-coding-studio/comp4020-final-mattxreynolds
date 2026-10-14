import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { SERVER_ONLY_CANARY } from "../server/canary.ts";

// ADR 0007: answers stay under server/. Builds the client fresh and fails if
// the server-only canary shows up anywhere in the output.
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

it("keeps the server-only canary out of the built dist/", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "dist-"));
  await build({ logLevel: "silent", build: { outDir, emptyOutDir: true } });
  const built = files(outDir);
  expect(built.length).toBeGreaterThan(0);
  const leaks = built.filter((f) => readFileSync(f).includes(SERVER_ONLY_CANARY));
  expect(leaks).toEqual([]);
}, 60_000);
