#!/usr/bin/env node
// Dev tool: starts a throwaway production server (needs `pnpm build` first),
// launches a two-player voyage in two independent browser contexts, jumps to
// a phase with the test hook, and screenshots both rooms from a few angles.
//
//   node scripts/screenshot.ts --phase FLOOD --out /tmp/shots [--port 9100]
//     [--patch '{"flood":{"pumps":[true,false,false]}}'] [--views "spawn;left;right;back"]
//   node scripts/screenshot.ts --cinematic "1;9.5;20" [--ending survived|lost] [--live]
//
// Cinematic frames pin the cinematic clock (window.__btwCineClock) at each
// time, so frames are deterministic however slow the software renderer is;
// --live plays in real time instead. Each run also reports how long the
// cinematic took to mount and the longest frame gap (a compile freeze).
//
// Views are ";"-separated; each is "name" or "name:x,z,yaw,pitch" (yaw radians
// relative to the room's spawn direction).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const sessions = new WeakMap<Page, Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>>();

const { values } = parseArgs({
  options: {
    phase: { type: "string", default: "PROLOGUE" },
    out: { type: "string", default: "/tmp/shots" },
    port: { type: "string", default: "9100" },
    patch: { type: "string" },
    views: { type: "string", default: "spawn;left;right;back" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
    /** render tier: "high" (bloom, reflections, relief) or "low" */
    quality: { type: "string", default: "high" },
    /** re-apply the patch before every view (for state that evolves, e.g. a growing fire) */
    repatch: { type: "boolean", default: false },
    /** screenshot the opening cinematic at these seconds (e.g. "3;9;15") instead of rooms */
    cinematic: { type: "string" },
    /** with --cinematic: capture an ending ("survived" | "lost") instead of the intro */
    ending: { type: "string" },
    /** with --cinematic: play in real time instead of pinning the cinematic clock */
    live: { type: "boolean", default: false },
    /** with --cinematic: write a CPU profile of the first seconds after the cinematic starts (to --out) */
    profile: { type: "boolean", default: false },
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
    await ctx.addInitScript(
      ([code, token, q]) => {
        localStorage.setItem(`btw.seat.${code}`, token);
        localStorage.setItem("btw.quality", q);
      },
      [seat.code, seat.token, values.quality!],
    );
    await ctx.addInitScript(() => {
      // frame-gap monitor: the longest gap between animation frames since reset
      const w = window as unknown as { __gap: { max: number; last: number; frames: number } };
      w.__gap = { max: 0, last: performance.now(), frames: 0 };
      const tick = (now: number) => {
        w.__gap.max = Math.max(w.__gap.max, now - w.__gap.last);
        w.__gap.last = now;
        w.__gap.frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${name}] pageerror`, e));
    page.on("console", (m) => m.type() === "error" && console.error(`[${name}]`, m.text()));
    await page.goto(`${base}/v/${seat.code}`);
    await page.getByTestId("ready").click();
    pages.push([name, page]);
  }
  if (values.cinematic) {
    const [, page] = pages[0];
    const times = values.cinematic.split(";").map(Number);
    type Gap = { max: number; frames: number; last: number };
    const pin = (sec: number) => page.evaluate((x) => void ((window as unknown as { __btwCineClock?: number }).__btwCineClock = x), sec);
    const gap = () => page.evaluate(() => (window as unknown as { __gap: Gap }).__gap);
    const resetGap = () => page.evaluate(() => void Object.assign((window as unknown as { __gap: Gap }).__gap, { max: 0, frames: 0, last: performance.now() }));
    const prefix = values.ending ? `ending-${values.ending}` : "cinematic";
    if (values.ending) {
      for (const [, p] of pages) await p.getByTestId("skip-cinematic").click({ timeout: 8000 }).catch(() => {});
      await page.getByTestId("take-controls").waitFor({ timeout: 60000 });
      if (!values.live) await pin(times[0]);
      await resetGap();
      if (values.profile) await startProfile(page);
      await post(`/api/test/voyages/${a.code}/patch`, { phase: values.ending === "lost" ? "LOST" : "SURVIVED", practice: false });
    } else if (!values.live) await pin(times[0]);
    const t0 = Date.now();
    await page.getByTestId("cinematic").waitFor();
    const mounted = Date.now() - t0;
    // let the first shader compiles land before the first deterministic frame
    if (!values.live) for (let i = 0; i < 8; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    for (const sec of times) {
      if (values.live) await page.waitForTimeout(Math.max(0, sec * 1000 - (Date.now() - t0)));
      else {
        await pin(sec);
        // two frames, so every per-frame update has landed
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
      const file = join(values.out!, `${prefix}-${sec}s.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    if (values.profile) await stopProfile(page, join(values.out!, `${prefix}.cpuprofile`));
    const g = await gap();
    console.log(`cinematic visible ${mounted} ms after request; longest frame gap ${Math.round(g.max)} ms over ${g.frames} frames`);
  } else await roomShots(pages, a.code);
} finally {
  await browser.close();
  srv.kill();
  await new Promise((r) => srv.once("exit", r));
  rmSync(dir, { recursive: true, force: true });
}

async function roomShots(pages: [string, Page][], code: string): Promise<void> {
  const a = { code };
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
      if (values.repatch) {
        await post(`/api/test/voyages/${a.code}/patch`, patch);
        await page.waitForTimeout(400);
      }
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
}

async function startProfile(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  sessions.set(page, cdp);
}
/** Saves the profile and prints the heaviest self-time functions. */
async function stopProfile(page: Page, file: string): Promise<void> {
  const cdp = sessions.get(page);
  if (!cdp) return;
  await page.waitForTimeout(500);
  const { profile } = (await cdp.send("Profiler.stop")) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]; samples: number[]; timeDeltas: number[] } };
  writeFileSync(file, JSON.stringify(profile));
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const byName = new Map<string, number>();
  for (const n of profile.nodes) {
    const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
    byName.set(k, (byName.get(k) ?? 0) + (self.get(n.id) ?? 0));
  }
  console.log("profile top self time:");
  for (const [k, us] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${Math.round(us / 1000)} ms  ${k}`);
}
