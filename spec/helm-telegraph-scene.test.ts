import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { projectedSize, roomForDeck } from "../shared/rooms.ts";
import { atFinale } from "./helpers/at-finale.ts";
import { settingsFromClue } from "./helpers/finale.ts";
import { post, snapshot, type Sailor } from "./helpers/voyage.ts";

// The helm and telegraph finale worked in place (#64, #18): two phones, one
// Voyage. The Engine Room taps the telegraph, the Wheelhouse taps the helm,
// and ten seconds in band launches the Lifeboat. The opener and the middle
// are solved through the API first, since they are not what is under test.
const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser.close();
}, 60_000);

async function phone(who: Sailor, link: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const [name, value] = who.cookie.split("=");
  await context.addCookies([{ name, value, url: baseUrl }]);
  const page = await context.newPage();
  await page.goto(new URL(link, baseUrl).href);
  await page.getByTestId("scene").waitFor();
  await expect.poll(async () => Number(await page.getByTestId("scene").getAttribute("data-frames")), { timeout: 60_000 }).toBeGreaterThan(2);
  return page;
}

async function standAtFinale(voyageId: string, who: Sailor, deck: "Upper Deck" | "Lower Deck"): Promise<void> {
  const room = roomForDeck(deck);
  const res = await post(baseUrl, `/api/voyages/${voyageId}/intents`, who.cookie, {
    kind: "pose", x: room.finaleStand.x, y: room.eyeHeight, z: room.finaleStand.z, yaw: room.finaleStand.yaw, pitch: 0,
  });
  expect(res.status).toBe(200);
}

async function tap(page: Page, thing: string): Promise<void> {
  const canvas = page.getByTestId("scene");
  const at = JSON.parse((await canvas.getAttribute("data-things"))!) as Record<string, [number, number]>;
  expect(at[thing], `${thing} on screen in ${JSON.stringify(at)}`).toBeDefined();
  await canvas.tap({ position: { x: at[thing][0], y: at[thing][1] } });
}

const displays = async (page: Page): Promise<Record<string, string>> =>
  JSON.parse((await page.getByTestId("scene").getAttribute("data-displays")) ?? "{}") as Record<string, string>;
const shown = async (page: Page, id: string): Promise<string> => (await displays(page))[id] ?? "";

it("the helm and telegraph controls measure 44 px or more at 390x844 from the finale spot", () => {
  const PHONE = { width: 390, height: 422 };
  for (const [deck, index] of [["Upper Deck", 0], ["Lower Deck", 0]] as const) {
    const room = roomForDeck(deck);
    for (const t of room.things.filter((x) => x.control?.index === index)) {
      const px = projectedSize(room, room.finaleStand, t, PHONE);
      expect(Math.min(px.width, px.height), t.id).toBeGreaterThanOrEqual(44);
    }
  }
});

it("the Engine Room sets the telegraph and the Wheelhouse steers the helm in the scene; ten seconds in band launches the Lifeboat on both Decks", async () => {
  const l = await atFinale(baseUrl, "helm-telegraph");
  const { voyage, host, partner } = l;
  const view = async (who: Sailor) => (await snapshot(baseUrl, voyage.id, who.cookie)).draw!;
  const finale = (await view(host)).puzzles[2];
  const target = settingsFromClue(finale.clue!);
  const stop0 = (await view(partner)).puzzles[2].instrument!.valves![0];
  const helm0 = finale.instrument!.trims![0];

  await standAtFinale(voyage.id, host, "Upper Deck");
  await standAtFinale(voyage.id, partner, "Lower Deck");
  const wheelhouse = await phone(host, voyage.link);
  const engine = await phone(partner, voyage.link);

  // each Deck reads only its own half off the wall, and the unused rows are blank
  await expect.poll(() => shown(engine, "valve-0"), { timeout: 30_000 }).toBe(`Telegraph ${stop0}`);
  await expect.poll(() => shown(wheelhouse, "gauge-0"), { timeout: 30_000 }).toMatch(/^Heading -?\d+ {2}helm /);
  expect(await shown(wheelhouse, "gauge-1")).toMatch(/^Speed \d+ kn$/);
  expect(await shown(wheelhouse, "gauge-2")).toBe("");
  expect(await shown(engine, "valve-1")).toBe("");
  expect(Object.values(await displays(engine)).join(" ")).not.toMatch(/heading|speed|helm|band/i);

  // a control with no dial behind it is only examined
  await tap(engine, "valve-1-up");
  await expect.poll(() => engine.getByTestId("examine-text").innerText(), { timeout: 20_000 }).toMatch(/rusted solid/i);

  // the Wheelhouse steers, then the Engine Room sets the stop; the last tap puts the instrument in band
  for (let n = helm0; n !== target.trims[0]; n += Math.sign(target.trims[0] - n)) {
    const next = n + Math.sign(target.trims[0] - n);
    await tap(wheelhouse, `trim-0-${next > n ? "up" : "down"}`);
    await expect.poll(() => shown(wheelhouse, "gauge-0"), { timeout: 20_000 }).toMatch(new RegExp(`helm ${next}$`));
  }
  for (let n = stop0; n !== target.valves[0]; n += Math.sign(target.valves[0] - n)) {
    const next = n + Math.sign(target.valves[0] - n);
    await tap(engine, `valve-0-${next > n ? "up" : "down"}`);
    await expect.poll(() => shown(engine, "valve-0"), { timeout: 20_000 }).toBe(`Telegraph ${next}`);
  }
  await expect.poll(() => shown(wheelhouse, "hold"), { timeout: 20_000 }).toMatch(/^In band/);
  expect((await view(host)).strikes).toBe(0);

  // held for ten seconds, the Lifeboat launches and the end card shows a Score on both Decks
  for (const page of [wheelhouse, engine]) await page.getByTestId("end-score").waitFor({ timeout: 90_000 });
  for (const who of [host, partner]) expect((await view(who)).puzzles[2].status).toBe("solved");
  expect((await view(host)).strikes).toBe(0);
  for (const { stream } of l.streams) stream.close();
}, 240_000);
