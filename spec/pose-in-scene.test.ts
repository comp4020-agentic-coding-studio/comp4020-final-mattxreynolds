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
  if (!link) await page.getByRole("button", { name: "Play as guest" }).click();
  return page;
}

const where = async (page: Page): Promise<{ x: number; z: number }> => {
  const canvas = page.getByTestId("scene");
  return { x: Number(await canvas.getAttribute("data-x")), z: Number(await canvas.getAttribute("data-z")) };
};

it("after a reload the Player stands where they were", async () => {
  const host = await sailor();
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const partner = await sailor((await host.getByTestId("voyage-link").innerText()).trim());
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);
  await host.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => partner.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).innerText()).toMatch(/held by/i);
  await partner.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => host.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).innerText()).toMatch(/held by/i);
  await host.getByRole("button", { name: "Cast off" }).click();
  await partner.getByRole("button", { name: "Cast off" }).click();

  const scene = host.getByTestId("scene");
  await scene.waitFor();
  await expect.poll(async () => Number(await scene.getAttribute("data-frames"))).toBeGreaterThan(2);
  const start = await where(host);
  await host.keyboard.down("w");
  await expect.poll(async () => (await where(host)).z).toBeLessThan(start.z - 0.5);
  await host.keyboard.up("w");
  await host.waitForTimeout(200);
  const stood = await where(host);

  await host.reload();
  await scene.waitFor();
  await expect.poll(async () => Number(await scene.getAttribute("data-frames"))).toBeGreaterThan(2);
  const after = await where(host);
  expect(after.x).toBeCloseTo(stood.x, 1);
  expect(after.z).toBeCloseTo(stood.z, 1);
}, 60_000);
