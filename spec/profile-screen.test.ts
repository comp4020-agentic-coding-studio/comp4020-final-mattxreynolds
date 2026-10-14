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

async function startVoyage(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start a Voyage" }).click();
  await page.getByTestId("ship-name").waitFor();
  return (await page.getByTestId("voyage-code").innerText()).trim();
}

it("the profile lists two unfinished Voyages, resumes either, and ends one from the profile after a confirm", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Play as guest" }).click();
  const first = await startVoyage(page);
  await page.goto(baseUrl); // back home: starting another must not end the first
  await page.getByRole("button", { name: "Start a Voyage" }).click();
  await page.getByTestId("ship-name").waitFor();
  const second = (await page.getByTestId("voyage-code").innerText()).trim();
  await page.goto(baseUrl);

  await expect.poll(() => page.getByTestId("unfinished-voyage").count()).toBe(2);
  const listed = await page.getByTestId("unfinished-voyage").allInnerTexts();
  expect(listed.some((t) => t.includes(first))).toBe(true);
  expect(listed.some((t) => t.includes(second))).toBe(true);

  // resume the first one
  await page.getByTestId("unfinished-voyage").filter({ hasText: first }).getByRole("button", { name: "Resume" }).click();
  expect((await page.getByTestId("voyage-code").innerText()).trim()).toBe(first);
  await page.goto(baseUrl);

  // ending needs a confirm: backing out ends nothing
  const row = page.getByTestId("unfinished-voyage").filter({ hasText: first });
  await row.getByRole("button", { name: "End the Voyage" }).click();
  await row.getByRole("button", { name: "Keep sailing" }).click();
  expect(await page.getByTestId("unfinished-voyage").count()).toBe(2);

  await row.getByRole("button", { name: "End the Voyage" }).click();
  await row.getByRole("button", { name: "Yes, end it" }).click();
  await expect.poll(() => page.getByTestId("unfinished-voyage").count()).toBe(1);
  expect(await page.getByTestId("unfinished-voyage").innerText()).toContain(second);
  expect(await page.getByTestId("finished-voyage").count()).toBe(1);
  expect(await page.getByTestId("finished-voyage").innerText()).toContain("abandoned");
});

it("either Player ends the Voyage from inside the ship, after a confirm, and both land on a Finished profile", async () => {
  const host = await (await browser.newContext()).newPage();
  await host.goto(baseUrl);
  await host.getByRole("button", { name: "Play as guest" }).click();
  await startVoyage(host);
  const link = (await host.getByTestId("voyage-link").innerText()).trim();
  const partner = await (await browser.newContext()).newPage();
  await partner.goto(link);
  await partner.getByTestId("ship-name").waitFor();

  await partner.getByRole("button", { name: "End the Voyage" }).click();
  await partner.getByRole("button", { name: "Yes, end it" }).click();
  await expect.poll(() => partner.getByTestId("finished-voyage").count()).toBe(1);
  // the host, still in the lobby, is told and sent home
  await expect.poll(() => host.getByTestId("finished-voyage").count()).toBe(1);
  expect(await host.getByTestId("unfinished-voyage").count()).toBe(0);
});
