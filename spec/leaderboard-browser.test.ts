import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { playToFinaleHold } from "./helpers/launch.ts";
import { startSecondServer } from "./helpers/second-server.ts";

const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

it("both Players agree on the end card, and a signed-out reader sees the entry on the public Leaderboard live", async () => {
  let server = await startSecondServer({ now: T0 });
  try {
    const { voyage, host, partner } = await playToFinaleHold(server.url);
    await server.stop();
    server = await startSecondServer({ dataDir: server.dataDir, now: T0 + 11_000 });

    const reader = await (await browser.newContext()).newPage();
    await reader.goto(new URL("/leaderboard", server.url).href);
    await reader.getByTestId("leaderboard").waitFor({ timeout: 30_000 });
    expect(await reader.getByTestId("leaderboard-entry").count()).toBe(0);

    const pages = [];
    for (const who of [host, partner]) {
      const context = await browser.newContext();
      const [name, value] = who.cookie.split("=");
      await context.addCookies([{ name, value, url: server.url }]);
      const page = await context.newPage();
      await page.goto(new URL(voyage.link, server.url).href);
      await page.getByTestId("post-score").waitFor({ timeout: 30_000 });
      expect(await page.getByTestId("post-preview").innerText()).toContain("29:50");
      pages.push(page);
    }
    await pages[0].getByRole("button", { name: "Post our Score" }).click();
    await pages[0].getByText("Waiting for your partner to agree.").waitFor({ timeout: 30_000 });
    expect(await reader.getByTestId("leaderboard-entry").count()).toBe(0);

    await pages[1].getByRole("button", { name: "Post our Score" }).click();
    await reader.getByTestId("leaderboard-entry").waitFor({ timeout: 30_000 });
    const row = await reader.getByTestId("leaderboard-entry").innerText();
    expect(row).toContain(host.name);
    expect(row).toContain(partner.name);
    expect(row).toContain("29:50");
    await pages[0].getByText("Posted to the Leaderboard.").waitFor({ timeout: 30_000 });
  } finally {
    await server.stop();
  }
}, 180_000);
