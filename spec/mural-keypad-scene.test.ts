import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeFromClue } from "./helpers/mural.ts";
import { pageFor } from "./helpers/browser.ts";
import { underwayWith } from "./helpers/voyage.ts";

// The mural keypad worked in place (#53): the Wheelhouse reads the mural on the
// wall, the Engine Room presses the 3D buttons, and the hatch opens on both Decks.
const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function castOff(): Promise<{ host: Page; partner: Page }> {
  const l = await underwayWith(baseUrl, "mural"); // the Draw picks the opener at random
  const host = await pageFor(browser, baseUrl, l.voyage, l.host, { width: 390, height: 844 });
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner, { width: 390, height: 844 });
  for (const p of [host, partner]) {
    await p.getByTestId("scene").waitFor();
    await expect.poll(async () => Number(await p.getByTestId("scene").getAttribute("data-frames"))).toBeGreaterThan(2);
  }
  return { host, partner };
}

const attr = (page: Page, name: string): Promise<string | null> => page.getByTestId("scene").getAttribute(name);

async function walkNorthTo(page: Page, z: number): Promise<void> {
  await page.keyboard.down("w");
  await expect.poll(async () => Number(await attr(page, "data-z")), { timeout: 20_000 }).toBeLessThan(z);
  await page.keyboard.up("w");
}

async function press(page: Page, thing: string): Promise<void> {
  const at = JSON.parse((await attr(page, "data-things"))!) as Record<string, [number, number]>;
  expect(at[thing], `${thing} on screen in ${JSON.stringify(at)}`).toBeDefined();
  await page.getByTestId("scene").click({ position: { x: at[thing][0], y: at[thing][1] } });
}

async function keyIn(page: Page, code: string): Promise<void> {
  await press(page, "key-clear");
  for (const digit of code) await press(page, `key-${digit}`);
  await expect.poll(() => attr(page, "data-code")).toBe(code);
}

it("the Wheelhouse reads the mural, the Engine Room presses the keypad: a wrong code is a Strike, the right one opens the hatch on both Decks", async () => {
  const { host, partner } = await castOff();
  await walkNorthTo(host, 2.3);
  await walkNorthTo(partner, 2.1);

  await expect.poll(() => attr(host, "data-mural")).toMatch(/Panel 1/);
  const code = codeFromClue((await attr(host, "data-mural"))!);
  expect(code).toMatch(/^\d{4}$/);
  expect(await attr(partner, "data-mural")).toBeNull();

  // every keypad control is at least 44 px on screen from here
  const sizes = JSON.parse((await attr(partner, "data-sizes"))!) as Record<string, [number, number]>;
  const keys = ["clear", "enter", ...[..."0123456789"]].map((k) => `key-${k}`);
  for (const k of keys) {
    expect(sizes[k], k).toBeDefined();
    expect(Math.min(...sizes[k]), `${k} ${sizes[k]}`).toBeGreaterThanOrEqual(44);
  }

  const wrong = code === "0000" ? "0001" : "0000";
  await keyIn(partner, wrong);
  await press(partner, "key-enter");
  await expect.poll(() => host.getByTestId("strikes").innerText(), { timeout: 15_000 }).toMatch(/1/);
  await expect.poll(() => partner.getByTestId("strikes").innerText()).toMatch(/1/);

  await partner.waitForTimeout(1100); // the answer throttle allows about one a second
  await keyIn(partner, code);
  await press(partner, "key-enter");
  await expect.poll(() => attr(host, "data-opened"), { timeout: 15_000 }).toMatch(/opener/);
  await expect.poll(() => attr(partner, "data-opened")).toMatch(/opener/);
  await expect.poll(() => host.getByTestId("hatch").innerText()).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("hatch").innerText()).toMatch(/open/i);
}, 120_000);
