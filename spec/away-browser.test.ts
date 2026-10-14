import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { underway } from "./helpers/voyage.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const SLOW = 90_000;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(base: string, link: string, cookie: string): Promise<Page> {
  const context = await browser.newContext();
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  await page.goto(new URL(link, base).href);
  await page.getByTestId("clock").waitFor({ timeout: 30_000 });
  return page;
}

it("a backgrounded page is not Away", async () => {
  const server = await startSecondServer({ now: T0, ticking: true });
  const { voyage, host, partner } = await underway(server.url);
  const a = await open(server.url, voyage.link, host.cookie);
  const b = await open(server.url, voyage.link, partner.cookie);
  await b.bringToFront(); // a is now in the background
  await pause(12_000);
  await expect.poll(() => a.getByTestId("paused").count(), { timeout: 10_000 }).toBe(0);
  expect(await b.getByTestId("paused").count()).toBe(0);
  await a.getByTestId("clock").waitFor();
  await server.stop();
}, SLOW);

it("the connected Deck sees a paused screen with the code, and the Voyage resumes by itself when the partner is back", async () => {
  const server = await startSecondServer({ now: T0, ticking: true });
  const { voyage, host, partner } = await underway(server.url);
  const a = await open(server.url, voyage.link, host.cookie);
  const b = await open(server.url, voyage.link, partner.cookie);
  await b.context().close();
  const paused = a.getByTestId("paused");
  await paused.waitFor({ timeout: 30_000 });
  expect(await a.getByTestId("paused-code").innerText()).toBe(voyage.code);
  expect(await a.getByTestId("clock").count()).toBe(0);

  const back = await open(server.url, voyage.link, partner.cookie);
  await a.getByTestId("clock").waitFor({ timeout: 30_000 });
  expect(await a.getByTestId("paused").count()).toBe(0);
  expect(await back.getByTestId("paused").count()).toBe(0);
  await server.stop();
}, SLOW);
