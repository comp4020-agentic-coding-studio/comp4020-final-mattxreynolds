import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { expect, it } from "vitest";
import { look, url } from "./helpers.ts";

const live = (p: Page) => p.getByText("LINK: LIVE", { exact: true }).waitFor();
const strikes = (p: Page, n: number) => p.waitForFunction(
  n => document.querySelector("#strikes")?.getAttribute("aria-label") === `${n} of 3 strikes`, n,
);
const errorsOn = (p: Page, errors: string[]) => {
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => {
    // 409 is deliberate conflict feedback, and offline requests fail as expected.
    if (m.type() === "error" && !/409|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text());
  });
};
async function evidence(p: Page, name: string) {
  if (!process.env.EVIDENCE_DIR) return;
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  await p.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${name}.png`), fullPage: true });
}

it("plays through independent desktop/mobile seats, live lobby, isolation and offline recovery", async () => {
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const opContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const exContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lobbyContext = await browser.newContext();
    const isolatedContext = await browser.newContext();
    const op = await opContext.newPage(), ex = await exContext.newPage();
    const lobby = await lobbyContext.newPage(), isolated = await isolatedContext.newPage();
    for (const p of [op, ex, lobby, isolated]) { errorsOn(p, errors); await p.goto(url("/")); }
    await lobby.getByRole("button", { name: "Open a new room" }).waitFor({ state: "visible" });
    await op.getByRole("button", { name: "Open a new room" }).click();
    await op.waitForURL("**/room/*"); await live(op);
    const code = op.url().split("/").pop()!;
    await isolated.getByRole("button", { name: "Open a new room" }).click(); await live(isolated);
    await ex.locator("#join-code").fill(code);
    await ex.getByRole("button", { name: "Join room" }).click();
    await ex.getByRole("button", { name: /02 Expert/ }).click(); await live(ex);
    const ids = await Promise.all([op, ex].map(p => p.evaluate(() => localStorage.getItem("dead-air.player"))));
    expect(ids[0]).not.toBe(ids[1]);
    const player = await op.evaluate(async () => (await fetch("/api/players/me", {
      headers: { "x-player": localStorage.getItem("dead-air.player")! },
    })).json());
    await op.getByText("2 connected", { exact: false }).waitFor();
    const actionSent = op.waitForRequest(r => r.method() === "POST" && r.url().includes("/actions?"))
      .then(() => performance.now());
    await op.locator(".override").click(); const sent = await actionSent; await strikes(ex, 1);
    const propagationMs = performance.now() - sent;
    expect(propagationMs).toBeLessThan(1000);
    console.log(`browser action → Expert render: ${Math.round(propagationMs)}ms`);
    await strikes(isolated, 0);
    expect(await isolated.locator(".console-head").innerText()).toContain("AWAITING OPERATOR");
    expect(await ex.locator(".wire, .keypad-keys, .override").count()).toBe(0);
    expect(await ex.locator(".console-head").innerText()).toContain("NOT IN VIEW");
    const deadline = (await look(code, "operator")).endsAt;
    await ex.reload(); await live(ex); await strikes(ex, 1);
    expect(await ex.getByRole("button", { name: /02 Expert/ }).getAttribute("aria-pressed")).toBe("true");
    expect((await look(code, "expert")).endsAt).toBe(deadline);
    await evidence(op, "desktop-live"); await evidence(ex, "mobile-expert");
    for (const p of [op, ex]) expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await exContext.setOffline(true);
    await ex.getByText("LINK: RECONNECTING", { exact: true }).waitFor();
    expect(await ex.getByRole("button", { name: "Mission in progress" }).isDisabled()).toBe(true);
    const warning = await ex.locator(".link-warning").boundingBox();
    expect(warning).not.toBeNull();
    expect(warning!.y + warning!.height).toBeLessThan(844);
    await evidence(ex, "mobile-reconnecting");
    await op.locator(".override").click(); await strikes(op, 2);
    const finishSent = op.waitForRequest(r => r.method() === "POST" && r.url().includes("/actions?"))
      .then(() => performance.now());
    await op.locator(".override").click(); const ended = await finishSent;
    await lobby.locator(".run-when").filter({ hasText: `ROOM ${code}` }).waitFor();
    const logMs = performance.now() - ended;
    expect(logMs).toBeLessThan(1000);
    console.log(`browser completion → lobby render: ${Math.round(logMs)}ms`);
    await exContext.setOffline(false); await live(ex);
    await ex.getByText("Three strikes.", { exact: true }).waitFor();
    await strikes(ex, 3);
    expect((await look(code, "expert")).endsAt).toBe(deadline);
    await ex.getByRole("button", { name: "New mission", exact: true }).first().click();
    await op.getByText(`MISSION 002 · ROOM ${code}`, { exact: true }).waitFor();
    await strikes(op, 0);
    // Explicit leave removes stream presence promptly; reconnect/rejoin restores it.
    await ex.getByRole("button", { name: "Leave room" }).click();
    await op.getByText("just you", { exact: false }).waitFor();
    await ex.getByRole("button", { name: new RegExp(`Rejoin your last room, ${code}`) }).click();
    await live(ex); await op.getByText("2 connected", { exact: false }).waitFor();
    // Restore Operator on the narrow screen and inspect the actual device layout too.
    await ex.getByRole("button", { name: /01 Operator/ }).click(); await live(ex);
    await ex.locator(".override").waitFor();
    expect(await ex.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await evidence(ex, "mobile-operator");
    if (process.env.EVIDENCE_DIR) writeFileSync(path.join(process.env.EVIDENCE_DIR, "timings.json"),
      JSON.stringify({ propagationMs: Math.round(propagationMs), logMs: Math.round(logMs) }, null, 2));
    expect(player.id).toBe(ids[0]);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 30_000);

it("refuses racing UI commands and ignores an HTTP response delayed behind newer SSE", async () => {
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const a = await browser.newContext(), b = await browser.newContext();
    const op = await a.newPage(), peer = await b.newPage();
    errorsOn(op, errors); errorsOn(peer, errors);
    await op.goto(url("/")); await op.getByRole("button", { name: "Open a new room" }).click();
    await op.waitForURL("**/room/*"); await live(op);
    const code = op.url().split("/").pop()!;
    await peer.goto(op.url()); await live(peer);
    // Hold both outgoing commands until both UIs have acted on the same revision.
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let queued = 0;
    const hold = async (route: import("playwright").Route) => { queued++; await gate; await route.continue(); };
    await op.route("**/actions?*", hold); await peer.route("**/actions?*", hold);
    await Promise.all([op.getByRole("switch").first().click(), peer.getByRole("switch").first().click()]);
    await expect.poll(() => queued).toBe(2);
    release();
    await expect.poll(async () => Number(await op.getByRole("alert").count()) + Number(await peer.getByRole("alert").count())).toBe(1);
    const alerts = (await op.getByRole("alert").allTextContents()).concat(await peer.getByRole("alert").allTextContents());
    expect(alerts[0]).toContain("Read back");
    expect((await look(code, "operator")).revision).toBe(1);
    await op.unroute("**/actions?*"); await peer.unroute("**/actions?*");
    await strikes(op, 0); await strikes(peer, 0);
    // Obtain a real response but delay its delivery while another session acts.
    let deliver!: () => void, fetched = false;
    const responseGate = new Promise<void>(resolve => { deliver = resolve; });
    await op.route("**/actions?*", async route => {
      const response = await route.fetch(); fetched = true;
      await responseGate; await route.fulfill({ response });
    });
    await op.locator(".override").click(); await expect.poll(() => fetched).toBe(true);
    await strikes(op, 1); await strikes(peer, 1);
    expect(await op.locator(".override").isDisabled()).toBe(true);
    await peer.locator(".override").click(); await strikes(op, 2);
    deliver();
    await expect.poll(() => op.locator(".override").isEnabled()).toBe(true);
    await strikes(op, 2);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 20_000);

it("releases controls after a lost acknowledgement without automatically replaying the action", async () => {
  const browser = await chromium.launch();
  let deliver: (() => void) | undefined;
  try {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto(url("/"));
    await page.getByRole("button", { name: "Open a new room" }).click();
    await page.waitForURL("**/room/*"); await live(page);
    const code = page.url().split("/").pop()!;
    const gate = new Promise<void>(resolve => { deliver = resolve; });
    await page.route("**/actions?*", async route => {
      const response = await route.fetch(); // server applies and streams, acknowledgement is lost
      await gate; await route.fulfill({ response }).catch(() => {});
    });
    await page.getByRole("switch").first().click();
    await expect.poll(async () => (await look(code, "operator")).revision).toBe(1);
    await expect.poll(() => page.getByRole("switch").first().isEnabled(), { timeout: 7000 }).toBe(true);
    expect(await page.getByRole("alert").innerText()).toContain("outcome uncertain");
    expect((await look(code, "operator")).revision).toBe(1);
    deliver!(); await page.unroute("**/actions?*");
    await page.getByRole("switch").first().click();
    await expect.poll(async () => (await look(code, "operator")).revision).toBe(2);
  } finally { deliver?.(); await browser.close(); }
}, 15_000);
