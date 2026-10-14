import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function sailor(link?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link ?? baseUrl);
  if (!link) {
    await page.getByRole("button", { name: "Play as guest" }).click();
  }
  return page;
}

const card = (page: Page, deck: string) => page.getByTestId("deck-card").filter({ hasText: deck });

it("two Players take a Deck each and cast off, and each lands on their own empty Deck view", async () => {
  const host = await sailor();
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const link = (await host.getByTestId("voyage-link").innerText()).trim();
  const partner = await sailor(link);
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);

  // the lobby tells a solo marker how to play both Decks
  await expect.poll(() => host.locator("body").innerText()).toMatch(/second Chrome profile or an incognito window/i);

  await card(host, "Upper Deck").getByRole("button", { name: "Take" }).click();
  // both screens show the holder, live, and that they are connected
  await expect.poll(() => card(partner, "Upper Deck").innerText()).toMatch(/held by/i);
  await expect.poll(() => card(partner, "Upper Deck").innerText()).toMatch(/connected/i);

  await card(partner, "Lower Deck").getByRole("button", { name: "Take" }).click();
  await expect.poll(() => card(host, "Lower Deck").innerText()).toMatch(/held by/i);

  await host.getByRole("button", { name: "Cast off" }).click();
  await expect.poll(() => host.locator("body").innerText()).toMatch(/waiting for/i);
  expect(await host.getByTestId("deck-view").count()).toBe(0);
  await partner.getByRole("button", { name: "Cast off" }).click();

  await host.getByTestId("deck-view").waitFor();
  await partner.getByTestId("deck-view").waitFor();
  expect(await host.getByTestId("deck-view").innerText()).toMatch(/Upper Deck/);
  expect(await partner.getByTestId("deck-view").innerText()).toMatch(/Lower Deck/);
});
