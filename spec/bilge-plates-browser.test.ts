import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { pageFor } from "./helpers/browser.ts";
import { underwayAtMiddle } from "./helpers/voyage.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  await browser.close();
}, 30_000);

it("the Engine Room reads out the bilge survey and the Wheelhouse walks it: a rotten plate is a Strike back at the start, the plan's route opens the way on both Decks", async () => {
  const l = await underwayAtMiddle(baseUrl, "bilge-plates"); // the Draw picks the middle at random (#63); the opener is solved through the API
  const host = await pageFor(browser, baseUrl, l.voyage, l.host);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner);

  const planText = await partner.getByTestId("plan").innerText();
  expect(await host.getByTestId("plan").count()).toBe(0);
  const route = routes(parsePlan(planText))[0];
  const floor = host.getByTestId("floor");
  await floor.waitFor();
  const start = await floor.getByTestId("walker-at").innerText();

  // a first step off the route is a trapdoor, if the plan has one beside the start
  const lit = await floor.getByRole("button").allInnerTexts();
  expect(lit.length).toBeGreaterThan(0);
  const wrong = (["north", "south", "east", "west"] as const).find((d) => d !== route[0] && lit.some((t) => t.toLowerCase().startsWith(d)));
  if (wrong) {
    await floor.getByRole("button", { name: new RegExp(`^${wrong}`, "i") }).click();
    await expect.poll(() => host.getByTestId("strikes").innerText()).toMatch(/1/);
    await expect.poll(() => partner.getByTestId("strikes").innerText()).toMatch(/1/);
    await expect.poll(() => floor.getByTestId("walker-at").innerText()).toBe(start);
    expect(await partner.getByTestId("plan").innerText()).toBe(planText);
  }

  for (const dir of route) await floor.getByRole("button", { name: new RegExp(`^${dir}`, "i") }).click();
  await expect.poll(() => host.getByTestId("far-hatch").innerText()).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("far-hatch").innerText()).toMatch(/open/i);
}, 30_000);
