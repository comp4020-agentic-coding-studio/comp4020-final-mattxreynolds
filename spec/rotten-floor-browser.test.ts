import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeFromClue } from "./helpers/mural.ts";
import { pageFor } from "./helpers/browser.ts";
import { underwayWith } from "./helpers/voyage.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 30_000);
afterAll(async () => {
  await browser.close();
}, 30_000);

it("the Engine Room reads out the trapdoor plan and the Wheelhouse walks it: a trapdoor is a Strike back at the start, the plan's route opens the way on both Decks", async () => {
  const l = await underwayWith(baseUrl, "mural"); // the Draw picks the opener at random
  const host = await pageFor(browser, baseUrl, l.voyage, l.host);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner);

  // the opener first
  const code = codeFromClue(await host.getByTestId("mural").innerText());
  await partner.getByTestId("keypad").getByLabel("Code").fill(code);
  await partner.getByTestId("keypad").getByRole("button", { name: "Enter" }).click();

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
