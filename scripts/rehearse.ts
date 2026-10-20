// Focused, non-destructive production rehearsal. Creates one fictional crew,
// one room and two finished runs. Never prints browser bearer credentials.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import * as G from "../shared/game.ts";
import type { RoomView } from "../shared/view.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const evidenceDir = process.env.EVIDENCE_DIR ?? "/tmp/dead-air-rehearsal";
mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch();
const errors: string[] = [];
const live = (p: Page) => p.getByText("LINK: LIVE", { exact: true }).waitFor();
const rename = async (p: Page, name: string) => {
  await p.getByRole("button", { name: "Rename", exact: true }).click();
  await p.getByRole("textbox", { name: "New callsign" }).fill(name);
  await p.getByRole("button", { name: "Save", exact: true }).click();
  await p.locator(".big-callsign").filter({ hasText: name }).waitFor();
};
const publicIdentity = (p: Page) => p.evaluate(async () => {
  const res = await fetch("/api/players/me", { headers: { "x-player": localStorage.getItem("dead-air.player")! } });
  const { tag, callsign } = await res.json(); return { tag, callsign };
});
try {
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const op = await a.newPage(), ex = await b.newPage();
  for (const p of [op, ex]) {
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => {
      if (m.type() === "error" && !/400|401|403|409|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text());
    });
    await p.goto(base);
  }
  await rename(op, "C10-ALPHA"); await rename(ex, "C10-BRAVO");
  const alpha = await publicIdentity(op), bravo = await publicIdentity(ex);
  assert.notEqual(alpha.tag, bravo.tag);
  await op.getByRole("button", { name: "Open a new room" }).click();
  await op.waitForURL("**/room/*"); await live(op);
  const code = op.url().split("/").pop()!;
  await ex.locator("#join-code").fill(code);
  await ex.getByRole("button", { name: "Join room" }).click();
  await ex.getByRole("button", { name: /02 Expert/ }).click(); await live(ex);
  await op.getByText("2 connected", { exact: false }).waitFor();
  const view = async (): Promise<RoomView> => (await fetch(`${base}/api/rooms/${code}`)).json();
  const before = await view();
  await ex.getByRole("button", { name: "Begin mission", exact: true }).click();
  await op.getByRole("button", { name: "Mission in progress" }).waitFor();
  const started = await view();
  assert.equal(started.status, "live");
  await op.getByRole("switch").first().click();
  await ex.waitForFunction(() => document.querySelector("#strikes")?.getAttribute("aria-label") === "0 of 3 strikes");
  // Explicit API probes exercise server checks, bypassing disabled/absent UI.
  const probe = async (role: string, body: unknown, known = true) => ex.evaluate(async ({ code, role, body, known }) => {
    const res = await fetch(`/api/rooms/${code}/actions?role=${role}`, { method: "POST",
      headers: { "content-type": "application/json", "x-player": known ? localStorage.getItem("dead-air.player")! : "INVALID-REHEARSAL-TOKEN" },
      body: JSON.stringify(body) });
    const data = await res.json(); return { status: res.status, hasDevice: !!data.view?.device };
  }, { code, role, body, known });
  const stale = await probe("operator", { type: "flip", index: 0, missionNo: before.missionNo, revision: before.revision });
  assert.equal(stale.status, 409);
  const current = await view();
  const expert = await probe("expert", { type: "flip", index: 0, missionNo: current.missionNo, revision: current.revision });
  assert.deepEqual(expert, { status: 403, hasDevice: false });
  assert.equal((await probe("operator", { type: "cut", wire: 999, missionNo: 1, revision: current.revision })).status, 400);
  assert.equal((await probe("operator", { type: "start", missionNo: 1, revision: current.revision }, false)).status, 401);
  assert.equal((await view()).revision, current.revision);
  assert.equal((await view()).strikes, 0);
  // Two independently rendered Operator seats deliberately race the same
  // snapshot; hold both requests until both real buttons have been pressed.
  await ex.getByRole("button", { name: /01 Operator/ }).click(); await live(ex);
  let release!: () => void, queued = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const hold = async (route: import("playwright").Route) => { queued++; await gate; await route.continue(); };
  await op.route("**/actions?*", hold); await ex.route("**/actions?*", hold);
  const responses = [op, ex].map(p => p.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/actions?")));
  try {
    await Promise.all([op.getByRole("switch").nth(1).click(), ex.getByRole("switch").nth(1).click()]);
    for (let tries = 0; queued < 2 && tries < 100; tries++) await op.waitForTimeout(20);
    assert.equal(queued, 2);
  } finally { release(); }
  const raceStatuses = (await Promise.all(responses)).map(r => r.status()).sort();
  assert.deepEqual(raceStatuses, [200, 409]);
  await op.unroute("**/actions?*"); await ex.unroute("**/actions?*");
  assert.equal((await view()).revision, current.revision + 1);
  assert.equal((await view()).strikes, 0);
  await ex.getByRole("button", { name: /02 Expert/ }).click(); await live(ex);
  await ex.reload(); await live(ex);
  assert.equal((await publicIdentity(ex)).tag, bravo.tag);
  assert.equal((await view()).endsAt, started.endsAt);
  assert.equal(await ex.locator(".wire, .override, .keypad-keys").count(), 0);
  const station = await b.newPage(); await station.goto(base);
  await station.locator(".station-log > p").filter({ hasText: /missions? logged/ }).waitFor();
  await b.setOffline(true);
  await ex.getByText("LINK: RECONNECTING", { exact: true }).waitFor();
  await ex.screenshot({ path: path.join(evidenceDir, "mobile-reconnecting.png") });
  for (let strike = 1; strike <= 3; strike++) {
    await op.locator(".override").click();
    await op.waitForFunction(n => document.querySelector("#strikes")?.getAttribute("aria-label") === `${n} of 3 strikes`, strike);
  }
  await b.setOffline(false); await live(ex);
  await ex.getByText("Three strikes.", { exact: true }).waitFor();
  await station.locator(".run-when").filter({ hasText: `ROOM ${code}` }).waitFor();
  await ex.getByRole("button", { name: "New mission", exact: true }).first().click();
  await op.getByText(`MISSION 002 · ROOM ${code}`, { exact: true }).waitFor();
  await ex.getByRole("button", { name: "Begin mission", exact: true }).click();
  await op.getByRole("button", { name: "Mission in progress" }).waitFor();
  const deviceView = (await view()).device!;
  const device = { serial: deviceView.serial, wires: deviceView.wires.map(w => w.color),
    symbols: deviceView.symbols.map(s => s.glyph), switches: { lights: deviceView.switches.lights, initial: deviceView.switches.up },
    override: deviceView.override } as G.Device;
  await op.getByRole("button", { name: new RegExp(`^Cut wire ${G.solveWires(device) + 1},`) }).click();
  for (const i of G.solveSymbols(device)) await op.getByRole("button", { name: `Symbol ${device.symbols[i]}`, exact: true }).click();
  const history: G.KeyPress[] = [];
  for (let stage = 0; stage < 4; stage++) {
    const k = (await view()).device!.keypad;
    const position = G.solveKeypad({ display: k.display!, keys: k.keys }, stage, history);
    history.push({ position, label: k.keys[position] });
    await op.getByRole("button", { name: `Key in position ${position + 1}, labelled ${k.keys[position]}`, exact: true }).click();
  }
  const target = G.solveSwitches(device);
  for (let i = 0; i < target.length; i++) {
    if ((await view()).device!.switches.up[i] !== target[i]) await op.getByRole("switch").nth(i).click();
  }
  await op.getByRole("button", { name: "ENGAGE", exact: true }).click();
  for (let tries = 0; ; tries++) {
    assert.ok(tries < 60, "override did not reach a valid displayed time");
    if (G.overrideTimeOk(device, (await op.locator("#timer").innerText()).trim())) break;
    await op.waitForTimeout(200);
  }
  await op.locator(".override").click();
  await ex.getByText("Device secured.", { exact: true }).waitFor();
  const end = await view(); assert.equal(end.outcome, "defused"); assert.equal(end.strikes, 0);
  const runs = await (await fetch(`${base}/api/log?limit=100`)).json();
  const crewRuns = runs.runs.filter((r: { roomCode: string }) => r.roomCode === code);
  assert.equal(crewRuns.length, 2);
  assert.ok(crewRuns.every((r: { crew: { tag: string }[] }) => [alpha.tag, bravo.tag].every(tag => r.crew.some(c => c.tag === tag))));
  for (const [page, name] of [[op, "desktop-secured"], [ex, "mobile-expert-secured"]] as const) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(evidenceDir, `${name}.png`) });
  }
  assert.deepEqual(errors, []);
  const summary = { base, at: new Date().toISOString(), room: code, alpha, bravo,
    outcomes: crewRuns.map((r: { missionNo: number; outcome: string }) => ({ mission: r.missionNo, outcome: r.outcome })),
    probes: { stale: 409, expertDevice: 403, malformed: 400, unknownPlayer: 401 },
    raceStatuses, reconnectSameTag: true, deadlinePreserved: true, consoleErrors: errors };
  writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
