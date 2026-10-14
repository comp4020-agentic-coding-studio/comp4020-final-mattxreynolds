import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeFromClue } from "./helpers/mural.ts";

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

it("the Wheelhouse reads the mural, the Engine Room keys a code in: a wrong one is a Strike, the right one opens the hatch on both Decks", async () => {
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

  const mural = host.getByTestId("mural");
  await mural.waitFor();
  const code = codeFromClue(await mural.innerText());
  expect(code).toMatch(/^\d{4}$/);
  expect(await partner.getByTestId("mural").count()).toBe(0);

  const keypad = partner.getByTestId("keypad");
  await keypad.waitFor();
  const wrong = code === "0000" ? "0001" : "0000";
  await keypad.getByLabel("Code").fill(wrong);
  await keypad.getByRole("button", { name: "Enter" }).click();
  await expect.poll(() => host.getByTestId("strikes").innerText()).toMatch(/1/);
  await expect.poll(() => partner.getByTestId("strikes").innerText()).toMatch(/1/);
  const players = await host.getByTestId("player").allInnerTexts();
  const announcement = await host.getByRole("status").innerText();
  for (const name of players) expect(announcement).not.toContain(name.replace(" (you)", ""));

  await keypad.getByLabel("Code").fill(code);
  await keypad.getByRole("button", { name: "Enter" }).click();
  await expect.poll(() => host.getByTestId("hatch").innerText()).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("hatch").innerText()).toMatch(/open/i);
});

it("a half-typed keypad code is still there after the Engine Room reloads, and the Wheelhouse never sees it", async () => {
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

  const field = () => partner.getByTestId("keypad").getByLabel("Code");
  await field().waitFor();
  await field().fill("48");
  await partner.waitForTimeout(800); // the draft posts on a short debounce
  await partner.reload();
  await field().waitFor();
  await expect.poll(() => field().inputValue()).toBe("48");
  expect(await host.getByTestId("keypad").count()).toBe(0);
});
