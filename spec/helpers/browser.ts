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

/** Reads the current view through the page's test hook. */
export const viewOf = (page: Page): Promise<any> => page.evaluate(() => window.__btw?.view());

export async function waitView(page: Page, pred: string, timeout = 8000): Promise<void> {
  await page.waitForFunction(`(() => { const v = window.__btw?.view(); return v && (${pred}); })()`, null, { timeout });
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
