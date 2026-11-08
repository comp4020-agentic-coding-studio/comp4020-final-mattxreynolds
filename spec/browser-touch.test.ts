// Touch play (ADR 008) in two independent touch-screen profiles: a phone in
// landscape (Engineer) and a tablet (Navigator). Real touch input through CDP,
// no test hooks: the lobby shows the touch controls, the briefing says "Tap",
// the Engineer walks with the stick, looks down by dragging and presses the
// on-screen USE button; the Navigator taps the control in the view. Each
// press reaches the other seat in real time, and pause brings the card back.

import { afterAll, afterEach, expect, inject, it } from "vitest";
import type { CDPSession, Page } from "playwright";
import { closeBrowser, getBrowser, roomLoaded, waitView, type Profile } from "./helpers/browser.ts";
import { patch, testHooks } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
let profiles: Profile[] = [];
afterEach(async () => {
  for (const p of profiles) await p.context.close().catch(() => {});
  profiles = [];
});
afterAll(async () => {
  await closeBrowser();
});

async function touchProfile(width: number, height: number): Promise<Profile & { cdp: CDPSession }> {
  // deviceScaleFactor 1: a phone's 3× would triple the software-rendered pixels
  const context = await (await getBrowser()).newContext({ baseURL: baseUrl, viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors, cdp: await context.newCDPSession(page) };
}

type Pt = { x: number; y: number };
const touchEvent = (cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", p?: Pt) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });

/** One finger: down at `from`, slides to `to` in steps, stays down `holdMs`, lifts. */
async function drag(cdp: CDPSession, from: Pt, to: Pt, holdMs = 0, steps = 6): Promise<void> {
  await touchEvent(cdp, "touchStart", from);
  for (let i = 1; i <= steps; i++) await touchEvent(cdp, "touchMove", { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
  await touchEvent(cdp, "touchEnd");
}

/** Skips the opening cinematic with a tap (a mouse click would, rightly,
 * switch the page to mouse play). */
async function tapSkip(page: Page): Promise<void> {
  const skip = page.getByTestId("skip-cinematic");
  await skip.waitFor({ timeout: 8000 });
  await skip.tap();
  await page.getByTestId("cinematic").waitFor({ state: "detached", timeout: 5000 });
}

const promptText = (page: Page) => page.locator(".prompt").textContent({ timeout: 200 }).catch(() => null);

/** Walks forward with the move stick (left thumb) in short pushes, and
 * between them drags the view down a little (right thumb), until `control`
 * is under the reticle. Short pushes: a long one slides along the wall past it. */
async function walkAndAim(page: Page, cdp: CDPSession, control: RegExp): Promise<string> {
  const { width, height } = page.viewportSize()!;
  const stick = { x: width * 0.15, y: height * 0.7 };
  const look = { x: width * 0.75, y: height * 0.4 };
  for (let i = 0; i < 60; i++) {
    const text = await promptText(page);
    if (text && control.test(text)) return text;
    if (i % 3 === 0) await drag(cdp, stick, { x: stick.x, y: stick.y - 40 }, 250, 4);
    else await drag(cdp, look, { x: look.x, y: look.y + 10 }, 0, 2);
    await page.waitForTimeout(150); // a few frames for the reticle raycast
  }
  throw new Error(`never aimed at ${control}; last prompt: ${await promptText(page)}`);
}

it("a phone and a tablet play the opening with touch controls", async () => {
  const eng = await touchProfile(844, 390); // phone, landscape
  const nav = await touchProfile(1024, 768); // tablet
  profiles.push(eng, nav);
  const E = eng.page;
  const N = nav.page;

  // a touch screen starts in touch mode: the home page lists touch controls
  await E.goto("/");
  await E.getByTestId("controls-touch").waitFor();
  expect(await E.getByTestId("controls-keys").count()).toBe(0);

  await E.getByLabel("Your callsign").fill("Ada");
  await E.getByRole("button", { name: "Create voyage" }).tap();
  const code = (await E.getByTestId("voyage-code").textContent({ timeout: 8000 }))!.trim();
  await N.goto(`/v/${code}`);
  await N.getByLabel("Your callsign").fill("Lin");
  await N.getByRole("button", { name: "Board the ship" }).tap();
  await N.getByTestId("voyage-code").waitFor({ timeout: 8000 });
  await N.getByTestId("controls-touch").waitFor();

  await E.getByTestId("ready").tap();
  await N.locator('[data-role="ENGINEER"] .ready.yes').waitFor();
  await N.getByTestId("ready").tap();
  await waitView(E, "v.phase === 'PROLOGUE'");
  await Promise.all([tapSkip(E), tapSkip(N)]);
  await Promise.all([roomLoaded(E), roomLoaded(N)]);

  // the briefing card speaks touch, and tapping it shows the on-screen controls
  for (const page of [E, N]) {
    await expect.poll(() => page.getByTestId("take-controls").textContent()).toMatch(/^Tap to take the controls/);
    await page.getByTestId("controls-touch").waitFor();
    await page.getByTestId("take-controls").tap();
    await page.getByTestId("touch-use").waitFor();
    await page.getByTestId("touch-stick").waitFor();
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  }

  // Engineer: walk to the bus panel, look down at the lever, press USE
  const lever = await walkAndAim(E, eng.cdp, /Emergency bus lever/);
  expect(lever).toContain("USE to pull down"); // prompts name the button, not the E key
  expect(lever).not.toMatch(/\bE to\b/);
  await E.getByTestId("touch-use").tap();
  await waitView(N, "v.prologue.busOn === true", 1500);

  // Navigator: walk to the alarm console and tap the button itself in the view
  await walkAndAim(N, nav.cdp, /Alarm acknowledge/);
  const { width, height } = N.viewportSize()!;
  await N.touchscreen.tap(width / 2, height / 2);
  await Promise.all([waitView(E, "v.phase === 'POWER'", 1500), waitView(N, "v.phase === 'POWER'", 1500)]);

  // pause brings the briefing card back; tapping it resumes
  await E.getByTestId("touch-pause").tap();
  await E.getByTestId("take-controls").waitFor();
  expect(await E.getByTestId("touch-use").count()).toBe(0);
  await E.getByTestId("take-controls").tap();
  await E.getByTestId("touch-use").waitFor();

  expect(eng.errors, eng.errors.join("\n")).toEqual([]);
  expect(nav.errors, nav.errors.join("\n")).toEqual([]);
});

// The one hold-only control (the Bridge's door release, Act V) through both
// touch paths: a finger held still on the button itself, and USE held with
// the reticle on it. The server sees the hold for as long as the finger stays
// down, and lifting releases it. Uses the test hook to jump to Act V and the
// pose hook to stand at the panel; the presses are real touches.
it.skipIf(!testHooks())("a touch player holds the door release with a finger, or with USE", async () => {
  const eng = await touchProfile(844, 390);
  const nav = await touchProfile(844, 390);
  profiles.push(eng, nav);
  const E = eng.page;
  const N = nav.page;
  await E.goto("/");
  await E.getByLabel("Your callsign").fill("Ada");
  await E.getByRole("button", { name: "Create voyage" }).tap();
  const code = (await E.getByTestId("voyage-code").textContent({ timeout: 8000 }))!.trim();
  await N.goto(`/v/${code}`);
  await N.getByLabel("Your callsign").fill("Lin");
  await N.getByRole("button", { name: "Board the ship" }).tap();
  await N.getByTestId("voyage-code").waitFor({ timeout: 8000 });
  await E.getByTestId("ready").tap();
  await N.locator('[data-role="ENGINEER"] .ready.yes').waitFor();
  await N.getByTestId("ready").tap();
  await waitView(N, "v.phase === 'PROLOGUE'");
  await tapSkip(N);
  await patch(baseUrl, code, { phase: "ESCAPE", prologue: { busOn: true, acknowledged: true }, danger: 30 });
  await waitView(N, "v.phase === 'ESCAPE'");
  await roomLoaded(N);
  await N.getByTestId("take-controls").tap();
  await N.getByTestId("touch-use").waitFor();

  // face the escape panel on the Bridge's back wall, turned so the reticle
  // is on the door release
  const aimAt = async (yaw: number) => {
    await N.evaluate((y) => window.__btwPose?.({ x: 2.4, z: 2.75, yaw: Math.PI + y, pitch: -0.55 }), yaw);
    await N.waitForTimeout(500);
    return promptText(N);
  };
  let text: string | null = null;
  for (const yaw of [0.3, 0.25, 0.35, 0.2, 0.4]) if ((text = await aimAt(yaw)) && /Door release/.test(text)) break;
  expect(text).toMatch(/Door release — HOLD USE/);
  await expect.poll(() => N.getByTestId("touch-use").textContent()).toMatch(/^HOLD/);

  const center = async (testId: string) => {
    const b = (await N.getByTestId(testId).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  // USE held: the server holds the release until the thumb lifts
  await touchEvent(nav.cdp, "touchStart", await center("touch-use"));
  await waitView(N, "v.escape.held === true", 1500);
  await touchEvent(nav.cdp, "touchEnd");
  await waitView(N, "v.escape.held === false", 1500);

  // a finger held on the button itself, wherever the reticle is: look away
  // to the right so the button sits on the left (in the stick's half)
  await N.evaluate(() => window.__btwPose?.({ x: 2.4, z: 2.75, yaw: Math.PI, pitch: -0.55 }));
  await N.waitForTimeout(500);
  const button = await N.evaluate(() => {
    // the release's screen position, found the way a finger finds it
    for (let x = 0.05; x < 0.95; x += 0.02) for (let y = 0.2; y < 0.8; y += 0.03) {
      const ndc = [x * 2 - 1, -(y * 2 - 1)];
      if (window.__btwPick?.(ndc[0], ndc[1]) === "door-release") return { x: x * innerWidth, y: y * innerHeight };
    }
    return null;
  });
  expect(button, "door release not on screen").not.toBeNull();
  await touchEvent(nav.cdp, "touchStart", button!);
  await waitView(N, "v.escape.held === true", 1500);
  await touchEvent(nav.cdp, "touchEnd");
  await waitView(N, "v.escape.held === false", 1500);

  expect(nav.errors, nav.errors.join("\n")).toEqual([]);
});
