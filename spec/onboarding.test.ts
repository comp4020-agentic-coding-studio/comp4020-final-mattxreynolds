import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

it("a stranger plays as guest, starts a Voyage, and a partner reaches the same lobby by link or by code", async () => {
  const host = await (await browser.newContext()).newPage();
  await host.goto(baseUrl);

  // the first screen leads with "Play as guest" and says talking out loud is the only channel
  await expect.poll(() => host.getByRole("button", { name: "Play as guest" }).count()).toBe(1);
  await expect.poll(() => host.locator("body").innerText()).toMatch(/talking out loud is the only channel/i);

  await host.getByRole("button", { name: "Play as guest" }).click();
  const cookies = await host.context().cookies();
  expect(cookies.find((c) => c.name === "session")?.httpOnly).toBe(true);
  await host.getByRole("button", { name: "Start a Voyage" }).waitFor();

  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("ship-name").waitFor();
  const ship = (await host.getByTestId("ship-name").innerText()).trim();
  expect(ship.length).toBeGreaterThan(0);
  const code = (await host.getByTestId("voyage-code").innerText()).trim();
  expect(code).toMatch(/^SS-[A-Z]+-\d{4}$/);
  const link = (await host.getByTestId("voyage-link").innerText()).trim();
  expect(link).toContain("/v/");
  expect(await host.getByTestId("deck-card").count()).toBe(2);

  // a partner opening the link skips the first screen and lands in the lobby
  const byLink = await (await browser.newContext()).newPage();
  await byLink.goto(link);
  await byLink.getByTestId("ship-name").waitFor();
  expect((await byLink.getByTestId("ship-name").innerText()).trim()).toBe(ship);
  expect(await byLink.getByRole("button", { name: "Play as guest" }).count()).toBe(0);
  // and the host's lobby updates live, with no reload
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);

  // a partner on a phone types the code instead, into a Voyage with a free Deck
  const other = await (await browser.newContext()).newPage();
  await other.goto(baseUrl);
  await other.getByRole("button", { name: "Play as guest" }).click();
  await other.getByRole("button", { name: "Start a Voyage" }).click();
  await other.getByTestId("voyage-code").waitFor();
  const otherCode = (await other.getByTestId("voyage-code").innerText()).trim();
  const otherShip = (await other.getByTestId("ship-name").innerText()).trim();

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.goto(baseUrl);
  await phone.getByRole("button", { name: "Play as guest" }).click();
  await phone.getByLabel("Voyage code").fill(otherCode.toLowerCase());
  await phone.getByRole("button", { name: "Join" }).click();
  await phone.getByTestId("ship-name").waitFor();
  expect((await phone.getByTestId("ship-name").innerText()).trim()).toBe(otherShip);
  expect((await phone.getByTestId("voyage-code").innerText()).trim()).toBe(otherCode);
});
