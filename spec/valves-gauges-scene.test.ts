import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { roomForDeck } from "../shared/rooms.ts";
import { settingsFromClue } from "./helpers/finale.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";
import { intent, post, snapshot, underway, type Sailor } from "./helpers/voyage.ts";

// The finale worked in place (#55, #18): two phones, one Voyage. The Engine
// Room turns valve wheels and the Wheelhouse sets trims by tapping the wall,
// and the hold launches the Lifeboat. The opener and the middle are solved
// through the API first, since they are not what is under test.
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
  return page;
}

/** Stands the Player at the Room's finale spot, facing the wall of controls, as a returning Player would be found. */
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

/** Taps a dial's control until its read-out says `level`, one notch per tap. */
async function setDial(page: Page, kind: "valve" | "trim", index: number, from: number, to: number): Promise<void> {
  for (let n = from; n !== to; n += Math.sign(to - n)) {
    await tap(page, `${kind}-${index}-${to > n ? "up" : "down"}`);
    if (kind === "valve") await expect.poll(() => shown(page, `valve-${index}`), { timeout: 20_000 }).toBe(String(n + Math.sign(to - n)));
    else await expect.poll(() => shown(page, `gauge-${index}`), { timeout: 20_000 }).toMatch(new RegExp(`trim ${n + Math.sign(to - n)}$`));
  }
}

it("the Engine Room turns valve wheels and the Wheelhouse sets trims in the scene; drifting out resets the hold with no Strike, and ten seconds in band launches the Lifeboat on both Decks", async () => {
  const l = await underway(baseUrl);
  const { voyage, host, partner } = l;
  const view = async (who: Sailor) => (await snapshot(baseUrl, voyage.id, who.cookie)).draw!;
  const opener = (await view(host)).puzzles[0];
  expect((await intent(baseUrl, voyage.id, partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: codeFromClue(opener.clue!) })).status).toBe(200);
  const route = routes(parsePlan((await view(partner)).puzzles[1].clue!))[0];
  for (const dir of route) expect((await intent(baseUrl, voyage.id, host, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir })).status).toBe(200);
  const finale = (await view(host)).puzzles[2];
  expect(finale.status).toBe("live");
  const target = settingsFromClue(finale.clue!);
  const valves = (await view(partner)).puzzles[2].instrument!.valves!;
  const trims = finale.instrument!.trims!;

  await standAtFinale(voyage.id, host, "Upper Deck");
  await standAtFinale(voyage.id, partner, "Lower Deck");
  const wheelhouse = await phone(host, voyage.link);
  const engine = await phone(partner, voyage.link);
  for (const page of [wheelhouse, engine]) {
    await page.getByTestId("scene").waitFor();
    await expect.poll(async () => Number(await page.getByTestId("scene").getAttribute("data-frames")), { timeout: 30_000 }).toBeGreaterThan(2);
  }

  // each Deck reads only its own half off the wall
  await expect.poll(() => shown(engine, "valve-0"), { timeout: 20_000 }).toBe(String(valves[0]));
  await expect.poll(() => shown(wheelhouse, "gauge-0"), { timeout: 20_000 }).toMatch(/trim/);
  expect(Object.keys(await displays(engine)).every((k) => k.startsWith("valve"))).toBe(true);
  expect(Object.values(await displays(engine)).join(" ")).not.toMatch(/trim|band/i);

  // the Wheelhouse sets every trim, then the Engine Room turns every valve; the last valve puts the gauges in band
  for (let i = 0; i < 3; i++) await setDial(wheelhouse, "trim", i, trims[i], target.trims[i]);
  for (let i = 0; i < 2; i++) await setDial(engine, "valve", i, valves[i], target.valves[i]);
  await setDial(engine, "valve", 2, valves[2], target.valves[2]);
  await expect.poll(() => shown(wheelhouse, "hold"), { timeout: 20_000 }).toMatch(/^In band/);

  // one notch out of band resets the hold, with no Strike
  await tap(engine, "valve-0-up");
  await expect.poll(() => shown(wheelhouse, "hold"), { timeout: 20_000 }).toBe("Out of band");
  expect((await view(host)).strikes).toBe(0);
  await tap(engine, "valve-0-down");
  await expect.poll(() => shown(wheelhouse, "hold"), { timeout: 20_000 }).toMatch(/^In band 0 s/);

  // held for ten seconds, the Lifeboat launches on both Decks
  // (the end card is #60's; until it lands both Decks leave the scene for their finished Voyages)
  for (const page of [wheelhouse, engine]) {
    await expect.poll(() => page.getByTestId("finished-voyage").innerText().catch(() => ""), { timeout: 40_000 }).toMatch(/launched/i);
  }
  for (const who of [host, partner]) expect((await view(who)).puzzles[2].status).toBe("solved");
  expect((await view(host)).strikes).toBe(0);
}, 180_000);

it("a control pressed in the scene while the finale is not live is only examined: rusted solid, no dial turns, no Strike", async () => {
  const l = await underway(baseUrl);
  const { voyage, host } = l;
  await standAtFinale(voyage.id, host, "Upper Deck");
  const page = await phone(host, voyage.link);
  await page.getByTestId("scene").waitFor();
  await expect.poll(async () => Number(await page.getByTestId("scene").getAttribute("data-frames")), { timeout: 30_000 }).toBeGreaterThan(2);
  await tap(page, "trim-0-up");
  await expect.poll(() => page.getByTestId("examine-text").innerText(), { timeout: 20_000 }).toMatch(/rusted solid/i);
  expect((await snapshot(baseUrl, voyage.id, host.cookie)).draw!.strikes).toBe(0);
}, 90_000);
