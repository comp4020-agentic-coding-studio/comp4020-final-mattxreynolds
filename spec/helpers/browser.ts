import type { Browser, Page } from "playwright";
import type { Sailor, Started } from "./voyage.ts";

/** A page for a seated Sailor, already inside the Voyage's Deck view. Lets a spec choose its Draw through the API, then play it in a browser. */
export async function pageFor(
  browser: Browser,
  base: string,
  voyage: Started,
  who: Sailor,
  viewport?: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  context.setDefaultTimeout(90_000); // generous: browser specs are slow under load
  const [name, value] = who.cookie.split("=");
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  await page.goto(new URL(voyage.link, base).href);
  await page.getByTestId("deck-view").waitFor({ timeout: 90_000 });
  return page;
}
