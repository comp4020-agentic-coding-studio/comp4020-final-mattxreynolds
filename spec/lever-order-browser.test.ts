import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { pageFor } from "./helpers/browser.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { underwayWith } from "./helpers/voyage.ts";

// The lever order (#62), 2D and in place. The Draw picks the opener at random,
// so each spec asks the API for a Voyage whose opener is the lever order.
const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

const PHONE = { width: 390, height: 844 };
const wrongOrder = (order: string): string => ([...order].reverse().join("") === order ? order.slice(1) + order[0] : [...order].reverse().join(""));

it("2D: the Wheelhouse reads the wiring card, the Engine Room pulls the levers: a wrong order is one Strike, the right one opens the hatch on both Decks", async () => {
  const l = await underwayWith(baseUrl, "levers");
  const host = await pageFor(browser, baseUrl, l.voyage, l.host);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner);

  const card = host.getByTestId("mural");
  await card.waitFor({ timeout: 90_000 });
  const order = codeFromClue(await card.innerText());
  expect(order).toMatch(/^[1-5]{5}$/);
  expect(await partner.getByTestId("mural").count()).toBe(0);
  expect(await partner.getByTestId("keypad").count()).toBe(0);

  const levers = partner.getByTestId("levers");
  await levers.waitFor();
  const pull = async (digits: string): Promise<void> => {
    await levers.getByRole("button", { name: "Clear" }).click();
    for (const d of digits) await levers.getByRole("button", { name: `Lever ${d}`, exact: true }).click();
    await expect.poll(() => levers.getByTestId("lever-order").innerText(), { timeout: 60_000 }).toBe(digits);
    await levers.getByRole("button", { name: "Set" }).click();
  };
  await pull(wrongOrder(order));
  await expect.poll(() => host.getByTestId("strikes").innerText(), { timeout: 60_000 }).toMatch(/1 of 3/);
  await expect.poll(() => partner.getByTestId("strikes").innerText(), { timeout: 60_000 }).toMatch(/1 of 3/);

  await partner.waitForTimeout(1100); // the answer throttle allows about one a second
  await pull(order);
  await expect.poll(() => host.getByTestId("hatch").innerText(), { timeout: 60_000 }).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("hatch").innerText(), { timeout: 60_000 }).toMatch(/open/i);
  expect(await host.getByTestId("strikes").innerText()).toMatch(/1 of 3/);
}, 400_000);

const attr = (page: Page, name: string): Promise<string | null> => page.getByTestId("scene").getAttribute(name);

async function walkNorthTo(page: Page, z: number): Promise<void> {
  await page.keyboard.down("w");
  await expect.poll(async () => Number(await attr(page, "data-z")), { timeout: 60_000 }).toBeLessThan(z);
  await page.keyboard.up("w");
}

/** Strafes to x with short key taps that re-check where the Player is, so a slow machine cannot overshoot. */
async function strafeTo(page: Page, x: number): Promise<void> {
  for (let tap = 0; tap < 200; tap++) {
    const at = Number(await attr(page, "data-x"));
    if (Math.abs(at - x) < 0.08) return;
    const key = at < x ? "d" : "a";
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(150, Math.abs(at - x) * 150));
    await page.keyboard.up(key);
    await page.waitForTimeout(50);
  }
  throw new Error("could not strafe into place");
}

async function press(page: Page, thing: string): Promise<void> {
  const at = JSON.parse((await attr(page, "data-things"))!) as Record<string, [number, number]>;
  expect(at[thing], `${thing} on screen in ${JSON.stringify(at)}`).toBeDefined();
  expect(at[thing][0] > 0 && at[thing][0] < 342 && at[thing][1] > 0 && at[thing][1] < 422, `${thing} inside the view: ${JSON.stringify(at)} at x ${await attr(page, "data-x")} z ${await attr(page, "data-z")} yaw ${await attr(page, "data-yaw")}`).toBe(true);
  await page.getByTestId("scene").click({ position: { x: at[thing][0], y: at[thing][1] }, timeout: 60_000 });
}

it("in the scene: the card on the Wheelhouse wall, lever controls of at least 44 px at 390 by 844 in the Engine Room; a wrong order is one Strike, the right one opens the hatch", async () => {
  const l = await underwayWith(baseUrl, "levers");
  const host = await pageFor(browser, baseUrl, l.voyage, l.host, PHONE);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner, PHONE);
  for (const p of [host, partner]) {
    await p.getByTestId("scene").waitFor();
    await expect.poll(async () => Number(await attr(p, "data-frames")), { timeout: 90_000 }).toBeGreaterThan(2);
  }
  await walkNorthTo(host, 2.3);
  await walkNorthTo(partner, 1.95); // the five levers are within 2 m from here, with room to overshoot a little
  // the lever bank is east of the keypad: strafe to stand in front of it
  await strafeTo(partner, 4.1); // the bank is centred on x = 4.1

  await expect.poll(() => attr(host, "data-mural"), { timeout: 60_000 }).toMatch(/Wire 1/);
  const order = codeFromClue((await attr(host, "data-mural"))!);
  expect(order).toMatch(/^[1-5]{5}$/);
  expect(await attr(partner, "data-mural")).toBeNull();

  const sizes = JSON.parse((await attr(partner, "data-sizes"))!) as Record<string, [number, number]>;
  for (const id of ["lever-1", "lever-2", "lever-3", "lever-4", "lever-5", "lever-clear", "lever-set"]) {
    expect(sizes[id], id).toBeDefined();
    expect(Math.min(...sizes[id]), `${id} ${sizes[id]}`).toBeGreaterThanOrEqual(44);
  }

  const pull = async (digits: string): Promise<void> => {
    await press(partner, "lever-clear");
    for (const d of digits) await press(partner, `lever-${d}`);
    await expect.poll(() => attr(partner, "data-code"), { timeout: 60_000 }).toBe(digits);
    await press(partner, "lever-set");
  };
  await pull(wrongOrder(order));
  await expect.poll(() => host.getByTestId("strikes").innerText(), { timeout: 60_000 }).toMatch(/1 of 3/);
  await expect.poll(() => partner.getByTestId("strikes").innerText(), { timeout: 60_000 }).toMatch(/1 of 3/);

  await partner.waitForTimeout(1100);
  await pull(order);
  await expect.poll(() => attr(host, "data-opened"), { timeout: 60_000 }).toMatch(/opener/);
  await expect.poll(() => attr(partner, "data-opened"), { timeout: 60_000 }).toMatch(/opener/);
  await expect.poll(() => partner.getByTestId("hatch").innerText(), { timeout: 60_000 }).toMatch(/open/i);
}, 400_000);
