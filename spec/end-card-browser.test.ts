import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { intent, underway } from "./helpers/voyage.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

it("both Decks show the end card, and either opens the debrief from it or from the profile's Finished list", async () => {
  const server = await startSecondServer();
  try {
    const { voyage, host, partner } = await underway(server.url);
    const pages = [];
    for (const who of [host, partner]) {
      const context = await browser.newContext();
      const [name, value] = who.cookie.split("=");
      await context.addCookies([{ name, value, url: server.url }]);
      const page = await context.newPage();
      await page.goto(new URL(voyage.link, server.url).href);
      await page.getByTestId("deck-view").waitFor({ timeout: 30_000 });
      pages.push(page);
    }
    expect((await intent(server.url, voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
    for (const page of pages) {
      await page.getByTestId("end-card").waitFor({ timeout: 30_000 });
      expect(await page.getByTestId("end-strikes").innerText()).toContain("0 of 3");
      expect(await page.getByTestId("end-solved").innerText()).toContain("0 of 3");
      expect(await page.getByTestId("end-score").count()).toBe(0); // only a launch has a Score
    }
    // from the end card
    await pages[0].getByRole("button", { name: "Open the debrief" }).click();
    await pages[0].getByTestId("debrief").waitFor({ timeout: 30_000 });
    expect(await pages[0].getByTestId("debrief-deck").count()).toBe(2);
    const text = await pages[0].getByTestId("debrief").innerText();
    expect(text).toContain("Wheelhouse");
    expect(text).toContain("Engine Room");
    expect(text).toContain(host.name);
    expect(text).toContain(partner.name);
    // from the profile
    await pages[1].getByRole("button", { name: "Back to profile" }).click();
    await pages[1].getByTestId("finished-voyage").waitFor({ timeout: 30_000 });
    await pages[1].getByTestId("finished-voyage").getByRole("button", { name: "Debrief" }).click();
    await pages[1].getByTestId("debrief").waitFor({ timeout: 30_000 });
    expect(await pages[1].getByTestId("timeline").innerText()).toContain("ended");
  } finally {
    await server.stop();
  }
}, 120_000);
