import { describe, expect, it } from "vitest";
import { leverAfter, roomForDeck } from "../shared/rooms.ts";

// The lever bank worked in place (#62). At 390 px wide a metre spans about
// 127 px from the 2 m reach limit, so 44 px is about 0.35 m.
const engine = roomForDeck("Lower Deck");
const controls = engine.things.filter((t) => t.control === "levers");

describe("the lever bank in the Engine Room", () => {
  it("has five levers, a clear and a set, all on the opener and pressed as lever controls", () => {
    expect(controls.map((t) => t.press).sort()).toEqual(["clear", "enter", "lever-1", "lever-2", "lever-3", "lever-4", "lever-5"]);
    for (const c of controls) expect(c.slot).toBe("opener");
  });

  it("every control is at least 0.36 m across and high, and none overlaps another or the keypad", () => {
    const all = engine.things.filter((t) => t.press);
    for (const c of controls) {
      expect(c.size[0]).toBeGreaterThanOrEqual(0.36);
      expect(c.size[1]).toBeGreaterThanOrEqual(0.36);
      for (const o of all) {
        if (o === c) continue;
        const apart = Math.abs(c.x - o.x) >= (c.size[0] + o.size[0]) / 2 || Math.abs(c.y - o.y) >= (c.size[1] + o.size[1]) / 2;
        expect(apart, `${c.id} vs ${o.id}`).toBe(true);
      }
    }
  });

  it("the keypad buttons are marked as keypad controls, and the order has a display", () => {
    for (const t of engine.things.filter((t) => t.press && t.control !== "levers")) expect(t.control).toBe("keypad");
    expect(engine.things.some((t) => t.screen === "order")).toBe(true);
  });

  it("every control can be reached from open floor, standing before the north wall", () => {
    for (const c of controls) {
      const reachable = [{ x: 2, z: 1.5 }, { x: 4, z: 1.5 }].some((me) => Math.hypot(c.x - me.x, c.z - me.z) <= engine.reach);
      expect(reachable, c.id).toBe(true);
    }
  });
});

describe("pulling levers", () => {
  it("builds the order one lever at a time, a lever pulled twice counts once, and at most five", () => {
    expect(leverAfter("", "lever-4")).toBe("4");
    expect(leverAfter("4", "lever-2")).toBe("42");
    expect(leverAfter("42", "lever-4")).toBe("42");
    expect(leverAfter("42135", "lever-1")).toBe("42135");
    expect(leverAfter("421", "clear")).toBe("");
    expect(leverAfter("421", "enter")).toBe("421");
  });
});
