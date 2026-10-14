import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { intent, type Sailor, underway } from "./helpers/voyage.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function open(who: Sailor, url: string): Promise<Page> {
  const context = await browser.newContext();
  const [name, value] = who.cookie.split("=");
  await context.addCookies([{ name, value, url: new URL(url).origin }]);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

it("Sail again on the end card opens a new lobby and a live banner on the partner's profile leads into it", async () => {
  const server = await startSecondServer();
  try {
    const { voyage, host, partner } = await underway(server.url);
    const hostPage = await open(host, new URL(voyage.link, server.url).href);
    await hostPage.getByTestId("deck-view").waitFor({ timeout: 30_000 });
    const partnerPage = await open(partner, server.url); // the partner waits on their profile
    await partnerPage.getByTestId("finished-voyage").or(partnerPage.getByText("Unfinished Voyages")).waitFor({ timeout: 30_000 });

    expect((await intent(server.url, voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
    await hostPage.getByTestId("end-card").waitFor({ timeout: 30_000 });
    await hostPage.getByRole("button", { name: `Sail again with ${partner.name}` }).click();
    await hostPage.getByTestId("deck-card").first().waitFor({ timeout: 30_000 });
    const newShip = await hostPage.getByTestId("ship-name").innerText();
    expect(newShip).not.toBe("");

    const banner = partnerPage.getByTestId("banner");
    await banner.waitFor({ timeout: 30_000 }); // live: no reload
    expect(await banner.innerText()).toContain(`${host.name} started a new Voyage with you`);
    await banner.getByRole("button").click();
    await partnerPage.getByTestId("deck-card").first().waitFor({ timeout: 30_000 });
    expect(await partnerPage.getByTestId("ship-name").innerText()).toBe(newShip);
    await hostPage.getByTestId("player").nth(1).waitFor({ timeout: 30_000 });
    expect(await hostPage.getByTestId("player").count()).toBe(2);
  } finally {
    await server.stop();
  }
}, 150_000);

it("Sail again is also on the debrief", async () => {
  const server = await startSecondServer();
  try {
    const { voyage, host, partner } = await underway(server.url);
    expect((await intent(server.url, voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
    const page = await open(partner, server.url);
    await page.getByTestId("finished-voyage").getByRole("button", { name: "Debrief" }).click({ timeout: 30_000 });
    await page.getByTestId("debrief").waitFor({ timeout: 30_000 });
    await page.getByTestId("debrief").getByRole("button", { name: `Sail again with ${host.name}` }).click();
    await page.getByTestId("deck-card").first().waitFor({ timeout: 30_000 });
  } finally {
    await server.stop();
  }
}, 150_000);
