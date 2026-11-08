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

/** The middle of `id` on screen, measured from a point already on it
 * (`from`, e.g. the reticle, or within 40 px of it): walks outward along
 * each axis to its edges.
 * A few dozen raycasts, not a full-screen scan: a software-rendered page
 * blocks for seconds on thousands, and the ship's roll moves the view
 * meanwhile. The middle, not the edge, so that roll can't carry it off. */
async function findOnScreen(page: Page, id: string, from: Pt): Promise<Pt | null> {
  return page.evaluate(
    ([target, x0, y0]) => {
      let fx = x0;
      let fy = y0;
      const on = (x: number, y: number) => window.__btwPick?.((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1) === target;
      // the ship's roll may have carried `from` just off it: look nearby
      if (!on(fx, fy)) {
        let near: [number, number] | null = null;
        for (let r = 8; r <= 40 && !near; r += 8)
          for (let dx = -r; dx <= r && !near; dx += 8)
            for (const dy of [-r, r]) if (on(fx + dx, fy + dy)) (near = [fx + dx, fy + dy]);
        for (let r = 8; r <= 40 && !near; r += 8) for (let dy = -r; dy <= r && !near; dy += 8) for (const dx of [-r, r]) if (on(fx + dx, fy + dy)) (near = [fx + dx, fy + dy]);
        if (!near) return null;
        [fx, fy] = near;
      }
      const reach = (dx: number, dy: number) => {
        let d = 0;
        while (d < 200 && on(fx + dx * (d + 3), fy + dy * (d + 3))) d += 3;
        return d;
      };
      return { x: fx + (reach(1, 0) - reach(-1, 0)) / 2, y: fy + (reach(0, 1) - reach(0, -1)) / 2 };
    },
    [id, from.x, from.y] as const,
  );
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
  // tap the middle of the button where it is on screen right now (the
  // ship's roll moves the view under a still camera)
  const { width, height } = N.viewportSize()!;
  const at = await findOnScreen(N, "prologue-ack", { x: width / 2, y: height / 2 });
  expect(at, "alarm button not on screen").not.toBeNull();
  await N.touchscreen.tap(at!.x, at!.y);
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
  // the escape station mounts and shows once its stage has compiled

  // stand close to the escape panel on the Bridge's back wall and turn until
  // the reticle is on the door release (the station shows once its stage has
  // compiled, so keep trying), then re-aim at the button's middle, not its
  // rim, where the ship's roll would carry the reticle off
  const { width: W, height: H } = N.viewportSize()!;
  const f = H / 2 / Math.tan((70 * Math.PI) / 360); // px per radian at the centre (70° fov)
  const pose = (y: number, p: number) => N.evaluate(([yy, pp]) => window.__btwPose?.({ x: 2.4, z: 3.15, yaw: Math.PI + yy, pitch: pp }), [y, p]);
  let yaw = 0;
  let pitch = -0.6;
  // the station shows once its stage has compiled: wait until a coarse scan
  // (every 16 px, ~1,300 raycasts) finds the release, then turn so the
  // reticle is on it
  await pose(yaw, pitch);
  let seen: Pt | null = null;
  await expect
    .poll(
      async () =>
        (seen = await N.evaluate(() => {
          for (let y = 16; y < innerHeight; y += 16) for (let x = 16; x < innerWidth; x += 16) if (window.__btwPick?.((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1) === "door-release") return { x, y };
          return null;
        })),
      { timeout: 30000, interval: 500 },
    )
    .not.toBeNull();
  yaw -= Math.atan((seen!.x - W / 2) / f);
  pitch -= Math.atan((seen!.y - H / 2) / f);
  await pose(yaw, pitch);
  await N.waitForTimeout(300);
  for (let step = 0; step < 3; step++) {
    const mid = await findOnScreen(N, "door-release", { x: W / 2, y: H / 2 });
    if (!mid) break;
    const dx = mid.x - W / 2;
    const dy = mid.y - H / 2;
    if (Math.hypot(dx, dy) < 3) break;
    yaw -= Math.atan(dx / f);
    pitch -= Math.atan(dy / f);
    await pose(yaw, pitch);
    await N.waitForTimeout(300);
  }
  await expect.poll(() => promptText(N)).toMatch(/Door release — HOLD USE/);
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

  // a finger held on the button itself, wherever the reticle is: turn right
  // so the button sits on the left (in the stick's half)
  const turn = 0.35;
  await pose(yaw - turn, pitch);
  await N.waitForTimeout(500);
  // turning right by `turn` moves the centred button left by f·tan(turn)
  const guess = { x: W / 2 - f * Math.tan(turn), y: H / 2 };
  const button = await findOnScreen(N, "door-release", guess);
  expect(button, "door release not on screen").not.toBeNull();
  await touchEvent(nav.cdp, "touchStart", button!);
  await waitView(N, "v.escape.held === true", 1500);
  await touchEvent(nav.cdp, "touchEnd");
  await waitView(N, "v.escape.held === false", 1500);

  expect(nav.errors, nav.errors.join("\n")).toEqual([]);
});

// The briefing card and the thumb controls fit the part of the screen an
// iPhone's Safari leaves visible (its toolbars, home indicator and notch).
// Viewports are Safari's visible area, not the device's; the safe-area insets
// are forced, since Chromium reports 0 for env(safe-area-inset-*).
it.skipIf(!testHooks())("the card and the thumb controls fit a phone's visible screen", async () => {
  const shapes = [
    { name: "portrait", width: 393, height: 659, inset: { r: 0, b: 34, l: 0 } },
    { name: "landscape", width: 750, height: 340, inset: { r: 47, b: 21, l: 47 } },
  ];
  for (const shape of shapes) {
    const a = await touchProfile(shape.width, shape.height);
    const b = await touchProfile(shape.width, shape.height);
    profiles.push(a, b);
    const code = await (async () => {
      await a.page.goto("/");
      await a.page.getByLabel("Your callsign").fill("Ada");
      await a.page.getByRole("button", { name: "Create voyage" }).tap();
      return (await a.page.getByTestId("voyage-code").textContent({ timeout: 8000 }))!.trim();
    })();
    await b.page.goto(`/v/${code}`);
    await b.page.getByLabel("Your callsign").fill("Lin");
    await b.page.getByRole("button", { name: "Board the ship" }).tap();
    await b.page.getByTestId("voyage-code").waitFor({ timeout: 8000 });
    await a.page.getByTestId("ready").tap();
    await b.page.locator('[data-role="ENGINEER"] .ready.yes').waitFor();
    await b.page.getByTestId("ready").tap();
    const P = b.page;
    await waitView(P, "v.phase === 'PROLOGUE'");
    await tapSkip(P);
    await roomLoaded(P);
    const { r, b: bottom, l } = shape.inset;
    await P.addStyleTag({ content: `.game.touch{--pad-r:${r}px!important;--pad-b:${bottom}px!important;--pad-l:${l}px!important}` });

    // the take-controls button is on the first screen, no scrolling
    const take = (await P.getByTestId("take-controls").boundingBox())!;
    expect(take.y + take.height, `${shape.name}: take-controls below the fold`).toBeLessThanOrEqual(shape.height);
    expect(await P.getByTestId("touch-help").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true);

    // the thumb controls clear the home indicator and the notch
    await P.getByTestId("take-controls").tap();
    for (const id of ["touch-use", "touch-pause", "touch-mute"]) {
      const box = (await P.getByTestId(id).boundingBox())!;
      expect(shape.height - (box.y + box.height), `${shape.name}: ${id} under the home indicator`).toBeGreaterThanOrEqual(bottom);
      expect(shape.width - (box.x + box.width), `${shape.name}: ${id} under the notch`).toBeGreaterThanOrEqual(r);
    }
    const stick = (await P.getByTestId("touch-stick").boundingBox())!;
    expect(stick.x, `${shape.name}: stick under the notch`).toBeGreaterThanOrEqual(l);
    expect(shape.height - (stick.y + stick.height)).toBeGreaterThanOrEqual(bottom);

    // back on the card, the controls list is folded so the button stays up top
    await P.getByTestId("touch-pause").tap();
    await P.getByTestId("take-controls").waitFor();
    expect(await P.getByTestId("touch-help").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);

    expect(b.errors, b.errors.join("\n")).toEqual([]);
    for (const p of [a, b]) await p.context.close();
  }
});
