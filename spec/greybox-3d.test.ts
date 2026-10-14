import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function sailor(link?: string, webgl = true): Promise<Page> {
  const context = await browser.newContext();
  if (!webgl) {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (/webgl/i.test(kind)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof original;
    });
  }
  const page = await context.newPage();
  await page.goto(link ?? baseUrl);
  if (!link) await page.getByRole("button", { name: "Play as guest" }).click();
  return page;
}

/** Two browsers, one Voyage, both cast off: the host on the Upper Deck, the partner on the Lower. */
async function castOff(hostWebgl = true, partnerWebgl = true): Promise<{ host: Page; partner: Page }> {
  const host = await sailor(undefined, hostWebgl);
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const partner = await sailor((await host.getByTestId("voyage-link").innerText()).trim(), partnerWebgl);
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);
  await host.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => partner.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).innerText()).toMatch(/held by/i);
  await partner.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => host.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).innerText()).toMatch(/held by/i);
  await host.getByRole("button", { name: "Cast off" }).click();
  await partner.getByRole("button", { name: "Cast off" }).click();
  return { host, partner };
}

const pose = async (page: Page): Promise<{ x: number; z: number }> => {
  const canvas = page.getByTestId("scene");
  return { x: Number(await canvas.getAttribute("data-x")), z: Number(await canvas.getAttribute("data-z")) };
};

async function smoke(page: Page, room: string): Promise<void> {
  const scene = page.getByTestId("scene");
  await scene.waitFor();
  await expect.poll(() => page.getByTestId("room-name").innerText()).toBe(room);
  // it renders: the frame counter ticks
  await expect.poll(async () => Number(await scene.getAttribute("data-frames"))).toBeGreaterThan(2);
  // it moves with WASD: W walks forward (north, towards smaller z), D sideways
  const before = await pose(page);
  await page.keyboard.down("w");
  await expect.poll(async () => (await pose(page)).z).toBeLessThan(before.z - 0.3);
  await page.keyboard.up("w");
  const mid = await pose(page);
  await page.keyboard.down("d");
  await expect.poll(async () => (await pose(page)).x).toBeGreaterThan(mid.x + 0.3);
  await page.keyboard.up("d");
  // the 2D view still carries the Voyage beside it
  await expect.poll(() => page.getByTestId("hatch").isVisible()).toBe(true);
}

describe("greybox Rooms in 3D", () => {
  it("the Wheelhouse loads, renders and moves with WASD", async () => {
    const { host } = await castOff();
    await smoke(host, "Wheelhouse");
  }, 60_000);

  it("the Engine Room loads, renders and moves with WASD", async () => {
    const { partner } = await castOff();
    await smoke(partner, "Engine Room");
  }, 60_000);

  it("the capture prompt is always visible and toggles pointer lock both ways", async () => {
    const { host } = await castOff();
    const prompt = host.getByTestId("look-prompt");
    await prompt.waitFor();
    // Software WebGL starves the page under a loaded run, so one round trip can outlast
    // expect.poll's 1 s default.
    const poll = { timeout: 15_000 };
    await expect.poll(() => prompt.innerText(), poll).toMatch(/click to look around/i);
    await prompt.click();
    await expect.poll(() => prompt.innerText(), poll).toMatch(/esc to release/i);
    expect(await host.evaluate(() => document.pointerLockElement !== null)).toBe(true);
    // While the mouse is locked, Playwright's mouse click never completes and its locator
    // calls can stall, so click the prompt from the page, on the next task so the release
    // does not hold up evaluate's reply.
    await host.evaluate(() => void setTimeout(() => document.querySelector<HTMLElement>("[data-testid=look-prompt]")!.click()));
    await expect.poll(() => prompt.innerText(), poll).toMatch(/click to look around/i);
    expect(await host.evaluate(() => document.pointerLockElement === null)).toBe(true);
    await expect.poll(() => prompt.isVisible(), poll).toBe(true);
  }, 60_000);

  it("with WebGL unavailable the 2D views carry the Voyage", async () => {
    const { host, partner } = await castOff(false, false);
    await host.getByTestId("deck-view").waitFor();
    await expect.poll(() => host.getByTestId("scene").count()).toBe(0);
    await expect.poll(() => host.getByTestId("scene-fallback").isVisible()).toBe(true);
    await expect.poll(() => host.getByTestId("hatch").isVisible()).toBe(true);
    await expect.poll(() => host.getByTestId("mural").isVisible()).toBe(true);
    // the keypad or the lever bank, whichever opener was drawn
    await expect.poll(async () => (await partner.getByTestId("keypad").isVisible()) || (await partner.getByTestId("levers").isVisible())).toBe(true);
  }, 60_000);
});
