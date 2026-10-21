#!/usr/bin/env node
// Dev tool: starts a throwaway production server (needs `pnpm build` first),
// launches a two-player voyage in two independent browser contexts, jumps to
// a phase with the test hook, and screenshots both rooms from a few angles.
//
//   node scripts/screenshot.ts --phase FLOOD --out /tmp/shots [--port 9100]
//     [--patch '{"flood":{"pumps":[true,false,false]}}'] [--views "spawn;left;right;back"]
//
// Views are ";"-separated; each is "name" or "name:x,z,yaw,pitch" (yaw radians
// relative to the room's spawn direction).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values } = parseArgs({
  options: {
    phase: { type: "string", default: "PROLOGUE" },
    out: { type: "string", default: "/tmp/shots" },
    port: { type: "string", default: "9100" },
    patch: { type: "string" },
    views: { type: "string", default: "spawn;left;right;back" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
    /** screenshot the opening cinematic at these seconds (e.g. "3;9;15") instead of rooms */
    cinematic: { type: "string" },
  },
});

const port = Number(values.port);
const base = `http://127.0.0.1:${port}`;
mkdirSync(values.out!, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "btw-shot-"));
const srv = spawn("node", ["server/index.ts"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOST: "127.0.0.1", DATABASE_PATH: join(dir, "db.sqlite"), ENABLE_TEST_HOOKS: "1", LOG_QUIET: "1" },
  stdio: "inherit",
});
for (let i = 0; i < 50; i++) {
  try {
    await fetch(base + "/healthz");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const a = await post("/api/voyages", { callsign: "ADA" });
  const b = await post(`/api/voyages/${a.code}/join`, { callsign: "LIN" });
  const pages: [string, Page][] = [];
  for (const [name, seat] of [["engineer", a], ["navigator", b]] as const) {
    const ctx = await browser.newContext({ viewport: { width: Number(values.width), height: Number(values.height) } });
    await ctx.addInitScript(([code, token]) => localStorage.setItem(`btw.seat.${code}`, token), [seat.code, seat.token]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${name}] pageerror`, e));
    page.on("console", (m) => m.type() === "error" && console.error(`[${name}]`, m.text()));
    await page.goto(`${base}/v/${seat.code}`);
    await page.getByTestId("ready").click();
    pages.push([name, page]);
  }
  if (values.cinematic) {
    const [, page] = pages[0];
    await page.getByTestId("cinematic").waitFor();
    const t0 = Date.now();
    for (const sec of values.cinematic.split(";").map(Number)) {
      await page.waitForTimeout(Math.max(0, sec * 1000 - (Date.now() - t0)));
      const file = join(values.out!, `cinematic-${sec}s.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    process.exitCode = 0;
  }
  // skip the opening cinematic on both seats (Space), as a player can
  for (const [, page] of pages) {
    await page.getByTestId("skip-cinematic").click({ timeout: 8000 }).catch(() => {});
  }
  await pages[0][1].getByTestId("take-controls").waitFor();
  const patch = { phase: values.phase, ...(values.patch ? JSON.parse(values.patch) : {}) };
  if (values.phase !== "PROLOGUE") patch.prologue = { busOn: true, acknowledged: true };
  if (values.phase !== "PROLOGUE" && patch.danger === undefined) patch.danger = 30;
  await post(`/api/test/voyages/${a.code}/patch`, patch);
  for (const [name, page] of pages) {
    await page.addStyleTag({ content: ".overlay:not(.ending){display:none!important}" });
    await page.waitForTimeout(1500);
    for (const v of values.views!.split(";")) {
      const [label, pose] = v.split(":");
      if (pose || label !== "spawn") {
        const preset: Record<string, string> = { left: "0,0,1.2,0", right: "0,0,-1.2,0", back: "0,0,3.14,0", down: "0,0,0,-0.5" };
        const [x, z, yaw, pitch] = (pose ?? preset[label] ?? "0,0,0,0").split(",").map(Number);
        await page.evaluate((p) => window.__btwPose?.(p), { x: pose ? x : undefined, z: pose ? z : undefined, yaw, pitch });
        await page.waitForTimeout(400);
      }
      const file = join(values.out!, `${values.phase!.toLowerCase()}-${name}-${label}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
