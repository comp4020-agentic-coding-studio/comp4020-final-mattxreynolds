// Two independent browser contexts = two separate profiles (no shared
// cookies or localStorage). Never use two pages of one context for two players.

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  browser ??= await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

export type Profile = { context: BrowserContext; page: Page; errors: string[] };

export async function profile(baseUrl: string): Promise<Profile> {
  const context = await (await getBrowser()).newContext({ baseURL: baseUrl, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return { context, page, errors };
}

/**
 * A slow link for one profile: `rttMs` of latency on HTTP (CDP network
 * emulation) and on the Socket.IO WebSocket (CDP emulation does not delay
 * frames on an open WebSocket, so frames are proxied with half the RTT added
 * in each direction, order preserved). Call before the page connects.
 */
export async function slowLink(p: Profile, rttMs: number): Promise<void> {
  const cdp = await p.context.newCDPSession(p.page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: rttMs,
    downloadThroughput: 256 * 1024,
    uploadThroughput: 128 * 1024,
  });
  const half = rttMs / 2;
  await p.page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => void setTimeout(() => server.send(m), half));
    server.onMessage((m) => void setTimeout(() => ws.send(m), half));
    ws.onClose((code, reason) => void setTimeout(() => server.close({ code, reason }), half));
    server.onClose((code, reason) => void setTimeout(() => ws.close({ code, reason }), half));
  });
}

/** Reads the current view through the page's test hook. */
export const viewOf = (page: Page): Promise<any> => page.evaluate(() => window.__btw?.view());

export async function waitView(page: Page, pred: string, timeout = 8000): Promise<void> {
  // interval polling, not rAF: a software-rendered frame can take 150 ms+
  await page.waitForFunction(`(() => { const v = window.__btw?.view(); return v && (${pred}); })()`, null, { timeout, polling: 50 });
}

/** Uses a control by interactable id, through the same path as pressing E. */
export async function use(page: Page, id: string, held?: boolean): Promise<void> {
  await page.waitForFunction((i) => window.__btw?.ids().includes(i), id, { timeout: 8000 });
  const ok = await page.evaluate(([i, h]) => window.__btw!.use(i as string, h as boolean | undefined), [id, held] as const);
  if (!ok) throw new Error(`control ${id} is not usable`);
}

/** Home → create voyage → returns the code. */
export async function createViaUi(p: Profile, callsign: string): Promise<string> {
  await p.page.goto("/");
  await p.page.getByLabel("Your callsign").fill(callsign);
  await p.page.getByRole("button", { name: "Create voyage" }).click();
  const code = (await p.page.getByTestId("voyage-code").textContent({ timeout: 8000 }))!.trim();
  return code;
}

export async function joinViaLink(p: Profile, code: string, callsign: string): Promise<void> {
  await p.page.goto(`/v/${code}`);
  await p.page.getByLabel("Your callsign").fill(callsign);
  await p.page.getByRole("button", { name: "Board the ship" }).click();
  await p.page.getByTestId("voyage-code").waitFor({ timeout: 8000 });
}

/** The opening cinematic plays when a voyage starts; a player can skip it.
 * Waits for it to appear (it always does on a live LOBBY → PROLOGUE) and
 * presses Skip, so the room mounts. */
export async function skipIntro(page: Page): Promise<void> {
  const skip = page.getByTestId("skip-cinematic");
  await skip.waitFor({ timeout: 8000 });
  await skip.click();
  await page.getByTestId("cinematic").waitFor({ state: "detached", timeout: 5000 });
}
