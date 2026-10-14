import { expect, test } from "vitest";
import { controlsMode, saveControlsMode, stickVector, walkTowards } from "../client/controls.ts";

const memory = (initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

test("a joystick pushed up walks forward at full speed, and one pushed half-way sideways at half", () => {
  expect(stickVector(0, -50, 50)).toEqual({ forward: 1, right: 0 });
  expect(stickVector(25, 0, 50)).toEqual({ forward: 0, right: 0.5 });
});

test("a joystick dragged past its rim is clamped to full speed", () => {
  const v = stickVector(300, 0, 50);
  expect(v.right).toBe(1);
  expect(v.forward).toBe(0);
});

test("a joystick barely moved stays still", () => {
  expect(stickVector(2, -2, 50)).toEqual({ forward: 0, right: 0 });
});

test("the Controls setting defaults to direct and remembers a change", () => {
  const storage = memory();
  expect(controlsMode(storage)).toBe("direct");
  saveControlsMode(storage, "tap");
  expect(controlsMode(storage)).toBe("tap");
});

test("a Controls value that is not a mode is ignored", () => {
  expect(controlsMode(memory({ controls: "garbage" }))).toBe("direct");
});

test("tap-to-walk heads for the tapped point and stops on arrival", () => {
  const ahead = walkTowards({ x: 5, z: 5 }, 0, { x: 5, z: 2 });
  expect(ahead?.forward).toBeCloseTo(1);
  expect(ahead?.right).toBeCloseTo(0);
  const east = walkTowards({ x: 5, z: 5 }, 0, { x: 8, z: 5 });
  expect(east?.right).toBeCloseTo(1);
  expect(walkTowards({ x: 5, z: 5 }, 0, { x: 5.05, z: 5 })).toBeNull();
});
