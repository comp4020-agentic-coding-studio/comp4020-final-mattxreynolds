import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

// Touch and portrait (#51, #17): a phone at 390x844, never rotated.
const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function phone(link?: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(link ?? baseUrl);
  if (!link) await page.getByRole("button", { name: "Play as guest" }).click();
  return page;
}

/** Two phones, one Voyage, both cast off: the host in the Wheelhouse, the partner in the Engine Room. */
async function castOff(): Promise<{ host: Page; partner: Page }> {
  const host = await phone();
  await host.getByRole("button", { name: "Start a Voyage" }).click();
  await host.getByTestId("voyage-link").waitFor();
  const partner = await phone((await host.getByTestId("voyage-link").innerText()).trim());
  await expect.poll(() => host.getByTestId("player").count()).toBe(2);
  await host.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => partner.getByTestId("deck-card").filter({ hasText: "Upper Deck" }).innerText()).toMatch(/held by/i);
  await partner.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).getByRole("button", { name: "Take" }).click();
  await expect.poll(() => host.getByTestId("deck-card").filter({ hasText: "Lower Deck" }).innerText()).toMatch(/held by/i);
  await host.getByRole("button", { name: "Cast off" }).click();
  await partner.getByRole("button", { name: "Cast off" }).click();
  return { host, partner };
}

const pose = async (page: Page): Promise<{ x: number; z: number }> => {
  const canvas = page.getByTestId("scene");
  return { x: Number(await canvas.getAttribute("data-x")), z: Number(await canvas.getAttribute("data-z")) };
};
const yaw = async (page: Page): Promise<number> => Number(await page.getByTestId("scene").getAttribute("data-yaw"));

/** One finger down at `from`, moved to `to`, held until `until` passes, then lifted. */
async function touchDrag(page: Page, from: [number, number], to: [number, number], until: () => Promise<void>): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, points: [number, number][]): Promise<unknown> =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await send("touchStart", [from]);
  await send("touchMove", [to]);
  await until();
  await send("touchEnd", []);
}

async function walksAndLooks(page: Page, room: string): Promise<void> {
  const scene = page.getByTestId("scene");
  await scene.waitFor();
  await expect.poll(() => page.getByTestId("room-name").innerText()).toBe(room);
  const stick = page.getByTestId("joystick");
  await stick.waitFor();
  const box = (await stick.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const toggle = (await page.getByTestId("controls-toggle").boundingBox())!;
  expect(toggle.width).toBeGreaterThanOrEqual(44);
  expect(toggle.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // the stick pushed up walks forward (north, smaller z)
  const before = await pose(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await touchDrag(page, [cx, cy], [cx, cy - box.height / 2], () =>
    expect.poll(async () => (await pose(page)).z).toBeLessThan(before.z - 0.3));

  // dragging on the scene looks
  const sb = (await scene.boundingBox())!;
  const y0 = await yaw(page);
  await touchDrag(page, [sb.x + 100, sb.y + 60], [sb.x + 250, sb.y + 60], () =>
    expect.poll(async () => Math.abs((await yaw(page)) - y0)).toBeGreaterThan(0.1));
}

describe("touch and portrait at 390x844", () => {
  it("the joystick walks and dragging looks in the Wheelhouse and the Engine Room", async () => {
    const { host, partner } = await castOff();
    await walksAndLooks(host, "Wheelhouse");
    await walksAndLooks(partner, "Engine Room");
  }, 90_000);

  it("the Controls setting swaps in tap-to-walk and survives a reload", async () => {
    const { host } = await castOff();
    await host.getByTestId("scene").waitFor();
    const toggle = host.getByTestId("controls-toggle");
    await expect.poll(() => toggle.innerText()).toMatch(/joystick/i);
    await toggle.click();
    await expect.poll(() => toggle.innerText()).toMatch(/tap to walk/i);
    expect(await host.getByTestId("joystick").count()).toBe(0);

    const before = await pose(host);
    const sb = (await host.getByTestId("scene").boundingBox())!;
    await host.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height - 20);
    await expect
      .poll(async () => {
        const p = await pose(host);
        return Math.hypot(p.x - before.x, p.z - before.z);
      })
      .toBeGreaterThan(0.3);

    await host.reload();
    await host.getByTestId("scene").waitFor();
    await expect.poll(() => host.getByTestId("controls-toggle").innerText()).toMatch(/tap to walk/i);
    expect(await host.getByTestId("joystick").count()).toBe(0);
  }, 90_000);
});
