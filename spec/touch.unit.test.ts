// Touch play (ADR 008): the stick, tap and prompt rules, the portrait lens,
// and that every way of pressing a control (E, click, USE button, tap) goes
// through one press/release path with one debounce and one hold.

import { afterEach, describe, expect, it, vi } from "vitest";
import { aimChanged, input, isHoldOnly, press, release, resetTouch } from "../client/scene/input.ts";
import { interactables } from "../client/scene/interact.tsx";
import { fingerPoints, fitFov, isTap, stickVector, TOUCH, touchPrompt } from "../client/scene/touch.ts";

describe("move stick", () => {
  it("is still inside the dead zone, so a resting thumb doesn't drift", () => {
    const v = stickVector(TOUCH.stickRadius * TOUCH.deadZone * 0.9, 0);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("drag up is forward, drag right is strafe right, full travel is full speed", () => {
    const up = stickVector(0, -TOUCH.stickRadius);
    expect(up.y).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const right = stickVector(TOUCH.stickRadius, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it("never exceeds full speed, and the knob stays on the ring", () => {
    const v = stickVector(500, -500);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(Math.hypot(v.knobX, v.knobY)).toBeCloseTo(TOUCH.stickRadius);
  });

  it("is analogue between the dead zone and the ring", () => {
    const half = stickVector(0, -TOUCH.stickRadius * (TOUCH.deadZone + (1 - TOUCH.deadZone) / 2));
    expect(half.y).toBeCloseTo(0.5);
  });
});

describe("taps", () => {
  it("a short, still touch is a tap; a drag or a long press is not", () => {
    expect(isTap(3, 120)).toBe(true);
    expect(isTap(TOUCH.tapSlopPx + 1, 120)).toBe(false);
    expect(isTap(3, TOUCH.tapMs + 1)).toBe(false);
  });
});

describe("fingertip", () => {
  it("tries the exact point first, then a ring around it", () => {
    const pts = fingerPoints(100, 200, 10);
    expect(pts[0]).toEqual([100, 200]);
    expect(pts).toHaveLength(9);
    for (const [x, y] of pts.slice(1)) expect(Math.hypot(x - 100, y - 200)).toBeCloseTo(10);
  });
});

describe("prompts on a touchscreen", () => {
  it("name the USE button, not the E key", () => {
    expect(touchPrompt("Breaker — OPEN · E to close")).toBe("Breaker — OPEN · USE to close");
    expect(touchPrompt("Door release — HOLD E · pressure LOW")).toBe("Door release — HOLD USE · pressure LOW");
    expect(touchPrompt("E to reset generator")).toBe("USE to reset generator");
    expect(touchPrompt("Isolator: E to throw")).toBe("Isolator: USE to throw");
  });

  it("leave words that merely contain an E alone", () => {
    expect(touchPrompt("ENGINE ROOM PULLED · E to pull NOW")).toBe("ENGINE ROOM PULLED · USE to pull NOW");
    expect(touchPrompt("Hand pump — rams isolated")).toBe("Hand pump — rams isolated");
    expect(touchPrompt("ARM DAVITS — accumulator 80% · E to arm")).toBe("ARM DAVITS — accumulator 80% · USE to arm");
  });

  it("cover every key-named prompt in the stations", async () => {
    // any prompt that still says "E" after rewriting would tell a phone
    // player to press a key they don't have
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".tsx") ? [join(dir, d.name)] : []));
    const prompts = files("client/scene")
      .filter((f) => !f.endsWith("interact.tsx"))
      .flatMap((f) => readFileSync(f, "utf8").match(/["`][^"`\n]*\bE\b[^"`\n]*["`]/g) ?? [])
      .filter((p) => /\bE to\b|\bHOLD E\b/.test(p));
    expect(prompts.length).toBeGreaterThan(10);
    for (const p of prompts) expect(touchPrompt(p), p).not.toMatch(/\bE to\b|\bHOLD E\b/);
  });
});

describe("portrait lens", () => {
  it("leaves landscape and square views alone", () => {
    expect(fitFov(70, 16 / 9)).toBe(70);
    expect(fitFov(70, 1)).toBe(70);
  });

  it("widens a portrait view so the horizontal angle matches a square view", () => {
    const fov = fitFov(70, 9 / 16);
    expect(fov).toBeGreaterThan(70);
    expect(fov).toBeLessThanOrEqual(100);
    const horizontal = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (9 / 16));
    if (fov < 100) expect((horizontal * 180) / Math.PI).toBeCloseTo(70);
  });

  it("is capped, so a very tall screen doesn't fisheye", () => {
    expect(fitFov(70, 0.2)).toBe(100);
    expect(fitFov(50, 0.2, 90)).toBe(90);
  });
});

describe("one press path for every input", () => {
  const object = {} as never;
  const add = (id: string, def: { onUse?: () => void; onHold?: (h: boolean) => void; disabled?: boolean }) =>
    interactables.set(id, { def: { id, prompt: id, ...def }, object });

  // ids are unique per test: the press debounce outlives a test by design
  afterEach(() => {
    release();
    resetTouch();
    interactables.clear();
    input.aimed = null;
    vi.useRealTimers();
  });

  it("uses the aimed control, and a second press inside the debounce is the same intent", () => {
    vi.useFakeTimers();
    const onUse = vi.fn();
    add("breaker", { onUse });
    input.aimed = "breaker";
    expect(press()).toBe(true);
    expect(press()).toBe(false); // USE button and a tap landing together
    vi.advanceTimersByTime(200);
    expect(press()).toBe(true);
    expect(onUse).toHaveBeenCalledTimes(2);
  });

  it("does nothing with nothing aimed, or a disabled control", () => {
    const onUse = vi.fn();
    add("dead", { onUse, disabled: true });
    expect(press()).toBe(false);
    expect(press("dead", "tap")).toBe(false);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("holds a hold-control until release", () => {
    const onHold = vi.fn();
    add("door", { onHold });
    add("lever", { onUse: () => {} });
    expect(isHoldOnly("door")).toBe(true);
    expect(isHoldOnly("lever")).toBe(false);
    press("door");
    expect(onHold).toHaveBeenLastCalledWith(true);
    release();
    expect(onHold).toHaveBeenLastCalledWith(false);
    release(); // idempotent
    expect(onHold).toHaveBeenCalledTimes(2);
  });

  it("a hold from the reticle ends when the reticle leaves the control", () => {
    const onHold = vi.fn();
    add("door-aim", { onHold });
    input.aimed = "door-aim";
    press();
    aimChanged("door-aim");
    expect(onHold).toHaveBeenCalledTimes(1);
    aimChanged(null);
    expect(onHold).toHaveBeenLastCalledWith(false);
  });

  it("a hold from a finger on the control survives the reticle drifting", () => {
    const onHold = vi.fn();
    add("door-tap", { onHold });
    press("door-tap", "tap");
    aimChanged(null);
    expect(onHold).toHaveBeenCalledTimes(1);
    resetTouch(); // pause / tab hidden drops it
    expect(onHold).toHaveBeenLastCalledWith(false);
  });

  it("resetTouch stops the stick and drops any unapplied look", () => {
    input.stick.x = 0.5;
    input.stick.y = 1;
    input.look.yaw = 0.3;
    resetTouch();
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.look).toEqual({ yaw: 0, pitch: 0 });
  });
});
