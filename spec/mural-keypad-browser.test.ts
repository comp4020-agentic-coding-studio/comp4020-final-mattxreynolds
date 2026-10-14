import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeFromClue } from "./helpers/mural.ts";
import { pageFor } from "./helpers/browser.ts";
import { underwayWith } from "./helpers/voyage.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

it("the Wheelhouse reads the mural, the Engine Room keys a code in: a wrong one is a Strike, the right one opens the hatch on both Decks", async () => {
  const l = await underwayWith(baseUrl, "mural"); // the Draw picks the opener at random
  const host = await pageFor(browser, baseUrl, l.voyage, l.host);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner);

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

  await host.waitForTimeout(1100); // the answer throttle allows about one a second
  await keypad.getByLabel("Code").fill(code);
  await keypad.getByRole("button", { name: "Enter" }).click();
  await expect.poll(() => host.getByTestId("hatch").innerText()).toMatch(/open/i);
  await expect.poll(() => partner.getByTestId("hatch").innerText()).toMatch(/open/i);
});

it("a half-typed keypad code is still there after the Engine Room reloads, and the Wheelhouse never sees it", async () => {
  const l = await underwayWith(baseUrl, "mural"); // the Draw picks the opener at random
  const host = await pageFor(browser, baseUrl, l.voyage, l.host);
  const partner = await pageFor(browser, baseUrl, l.voyage, l.partner);

  const field = () => partner.getByTestId("keypad").getByLabel("Code");
  await field().waitFor();
  await field().fill("48");
  await partner.waitForTimeout(800); // the draft posts on a short debounce
  await partner.reload();
  await field().waitFor();
  await expect.poll(() => field().inputValue()).toBe("48");
  expect(await host.getByTestId("keypad").count()).toBe(0);
});
