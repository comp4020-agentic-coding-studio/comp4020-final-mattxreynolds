import { chromium, type Browser } from "playwright";
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

it("both Decks show the same Clock and Strikes, with the five-minutes-left cue", async () => {
  const first = await startSecondServer({ now: T0 });
  const { voyage, host, partner } = await underway(first.url);
  await first.stop();
  const server = await startSecondServer({ dataDir: first.dataDir, now: T0 + 25 * 60_000 + 30_000 }); // 4:30 left
  const pages = [];
  for (const who of [host, partner]) {
    const context = await browser.newContext();
    const [name, value] = who.cookie.split("=");
    await context.addCookies([{ name, value, url: server.url }]);
    const page = await context.newPage();
    await page.goto(new URL(voyage.link, server.url).href);
    await page.getByTestId("clock").waitFor();
    pages.push(page);
  }
  const texts = await Promise.all(pages.map((p) => p.getByTestId("clock").innerText()));
  expect(texts[0]).toMatch(/^04:[23]\d/);
  expect(texts[1]).toMatch(/^04:[23]\d/);
  for (const p of pages) {
    await expect.poll(() => p.getByRole("status").allInnerTexts()).toContain("Five minutes left.");
    expect(await p.getByTestId("strikes").innerText()).toMatch(/0 of 3/);
  }
  await server.stop();
});
