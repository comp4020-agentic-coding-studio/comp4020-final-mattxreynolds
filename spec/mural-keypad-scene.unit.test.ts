import { describe, expect, it } from "vitest";
import { keypadAfter, roomForDeck } from "../shared/rooms.ts";

// The mural and the keypad worked in place (#53, #18). At 390 px wide the
// scene holds its horizontal view near 75 degrees, so from the 2 m reach limit
// a metre spans about 127 px and 44 px is about 0.35 m.
const engine = roomForDeck("Lower Deck");
const wheelhouse = roomForDeck("Upper Deck");
const buttons = engine.things.filter((t) => t.press && t.bank === "keypad");

describe("the keypad and the mural in the scene", () => {
  it("the Engine Room has a button for each digit, a clear and an enter, all on the opener", () => {
    expect(buttons.map((t) => t.press).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "enter"]);
    for (const b of buttons) expect(b.slot).toBe("opener");
  });

  it("every button is at least 0.36 m across and high, so 44 px on a phone from the reach limit", () => {
    for (const b of buttons) {
      expect(b.size[0]).toBeGreaterThanOrEqual(0.36);
      expect(b.size[1]).toBeGreaterThanOrEqual(0.36);
    }
  });

  it("no two buttons overlap", () => {
    for (const a of buttons)
      for (const b of buttons) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) >= (a.size[0] + b.size[0]) / 2 || Math.abs(a.y - b.y) >= (a.size[1] + b.size[1]) / 2;
        expect(apart, `${a.id} vs ${b.id}`).toBe(true);
      }
  });

  it("the mural shows the Clue and the keypad has a display for the code", () => {
    expect(wheelhouse.things.find((t) => t.id === "mural")?.screen).toBe("clue");
    expect(engine.things.some((t) => t.screen === "code")).toBe(true);
  });

  it("keys build a code of at most four digits, and clear empties it", () => {
    expect(keypadAfter("", "4")).toBe("4");
    expect(keypadAfter("48", "1")).toBe("481");
    expect(keypadAfter("4817", "2")).toBe("4817");
    expect(keypadAfter("481", "clear")).toBe("");
    expect(keypadAfter("481", "enter")).toBe("481");
  });
});
