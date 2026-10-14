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

/** A host alone on the Upper Deck with a partner on the Lower, both cast off; returns the host's page. */
async function wheelhouse(): Promise<Page> {
  const open = async (url: string, first: boolean): Promise<Page> => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(url);
    if (first) await page.getByRole("button", { name: "Play as guest" }).click();
    return page;
  };
  const host = await open(baseUrl, true);
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const partner = await open((await host.getByTestId("voyage-link").innerText()).trim(), false);
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);
  await host.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => partner.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).innerText()).toMatch(/held by/i);
  await partner.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => host.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).innerText()).toMatch(/held by/i);
  await host.getByRole("button", { name: "Cast off" }).click();
  await partner.getByRole("button", { name: "Cast off" }).click();
  await host.getByTestId("scene").waitFor();
  await expect.poll(async () => Number(await host.getByTestId("scene").getAttribute("data-frames"))).toBeGreaterThan(2);
  return host;
}

async function press(page: Page, thing: string): Promise<void> {
  const canvas = page.getByTestId("scene");
  const at = JSON.parse((await canvas.getAttribute("data-things"))!) as Record<string, [number, number]>;
  expect(at[thing], `${thing} on screen in ${JSON.stringify(at)}`).toBeDefined();
  await canvas.click({ position: { x: at[thing][0], y: at[thing][1] } });
}

const at = async (page: Page, axis: "x" | "z"): Promise<number> => Number(await page.getByTestId("scene").getAttribute(`data-${axis}`));

async function walk(page: Page, key: string, until: () => Promise<boolean>): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(until, { timeout: 10_000 }).toBe(true);
  await page.keyboard.up(key);
}

it("a station that is not live examines to rusted solid, with no cue and no Strike", async () => {
  const host = await wheelhouse();
  await walk(host, "a", async () => (await at(host, "x")) < 1.4); // the chart table, 1.3 m ahead, middle Puzzle dead
  await press(host, "chart-table");
  await expect.poll(() => host.getByTestId("examine-text").innerText()).toMatch(/rusted solid/i);
  expect(await host.getByTestId("strikes").innerText()).toMatch(/Strikes: 0/);
}, 60_000);

it("a press on a thing out of reach does nothing, and a press on bare wall does nothing", async () => {
  const host = await wheelhouse();
  await press(host, "mural"); // 5.4 m away from the start
  await host.getByTestId("scene").click({ position: { x: 5, y: 5 } });
  await host.waitForTimeout(500);
  expect(await host.getByTestId("examine-text").count()).toBe(0);
}, 60_000);

it("walking up to a thing brings it within reach", async () => {
  const host = await wheelhouse();
  await walk(host, "w", async () => (await at(host, "z")) < 2.2);
  await press(host, "mural"); // a live station, so it points at the Deck screen
  await expect.poll(() => host.getByTestId("examine-text").innerText()).toMatch(/Deck screen/i);
}, 60_000);
