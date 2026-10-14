import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeFromClue } from "./helpers/mural.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";

// The rotten floor worked in the scene at 390x844 (#54, #37): two phones, no 2D buttons pressed.
const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser.close();
}, 60_000);

async function phone(link?: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(link ?? baseUrl);
  if (!link) await page.getByRole("button", { name: "Play as guest" }).click();
  return page;
}

type Rect = { x: number; y: number; w: number; h: number };
const plates = async (page: Page): Promise<Record<string, Rect>> => {
  const raw = await page.getByTestId("scene").getAttribute("data-plates");
  return raw ? (JSON.parse(raw) as Record<string, Rect>) : {};
};

/** Taps a lit plate in the scene, after checking it is a 44 px target. */
async function tapPlate(page: Page, dir: string): Promise<void> {
  await expect.poll(async () => dir in (await plates(page)), { timeout: 20_000 }).toBe(true);
  const r = (await plates(page))[dir];
  expect(r.w, `${dir} plate width`).toBeGreaterThanOrEqual(44);
  expect(r.h, `${dir} plate height`).toBeGreaterThanOrEqual(44);
  const canvas = page.getByTestId("scene");
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + r.x + r.w / 2, box.y + r.y + r.h / 2);
}

it("the Walker crosses the dark floor by tapping plates in the scene while the plan holder reads the plan on the wall; a trapdoor is one Strike and back to the start", async () => {
  const host = await phone();
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const partner = await phone((await host.getByTestId("voyage-link").innerText()).trim());
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);
  await host.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => partner.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).innerText()).toMatch(/held by/i);
  await partner.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => host.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).innerText()).toMatch(/held by/i);
  await host.getByRole("button", { name: "Cast off" }).click();
  await partner.getByRole("button", { name: "Cast off" }).click();

  const code = codeFromClue(await host.getByTestId("mural").innerText());
  await partner.getByTestId("keypad").getByLabel("Code").fill(code);
  await partner.getByTestId("keypad").getByRole("button", { name: "Enter" }).click();

  // the plan is on the Engine Room's wall in the scene, and only there
  const planText = await partner.getByTestId("plan").innerText();
  await expect.poll(() => partner.getByTestId("scene").getAttribute("data-plan"), { timeout: 20_000 }).toBe(planText);
  expect(await host.getByTestId("scene").getAttribute("data-plan")).toBeNull();
  const route = routes(parsePlan(planText))[0];

  const scene = host.getByTestId("scene");
  await expect.poll(() => scene.getAttribute("data-walker"), { timeout: 20_000 }).not.toBeNull();
  const start = (await scene.getAttribute("data-walker"))!;

  // a step off the route, if one is lit, is a trapdoor
  const lit = Object.keys(await plates(host));
  expect(lit.length).toBeGreaterThan(0);
  const wrong = lit.find((d) => d !== route[0]);
  if (wrong) {
    await tapPlate(host, wrong);
    await expect.poll(() => host.getByTestId("strikes").innerText(), { timeout: 20_000 }).toMatch(/1 of 3/);
    await expect.poll(() => partner.getByTestId("strikes").innerText(), { timeout: 20_000 }).toMatch(/1 of 3/);
    await expect.poll(() => scene.getAttribute("data-walker")).toBe(start);
  }

  for (const dir of route) {
    const before = await scene.getAttribute("data-walker");
    await tapPlate(host, dir);
    await expect.poll(() => scene.getAttribute("data-walker"), { timeout: 20_000 }).not.toBe(before);
  }
  await expect.poll(() => host.getByTestId("far-hatch").innerText(), { timeout: 20_000 }).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("far-hatch").innerText(), { timeout: 20_000 }).toMatch(/open/i);
}, 180_000);
