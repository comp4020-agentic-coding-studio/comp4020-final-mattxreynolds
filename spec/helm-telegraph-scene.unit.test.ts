import { describe, expect, it } from "vitest";
import { controlLive, displayText, roomForDeck, type Display } from "../shared/rooms.ts";

const d = (show: "valve" | "gauge" | "hold", index = 0): Display => ({ id: "x", show, index, x: 0, y: 0, z: 0, size: [1, 1, 1] });

// The helm and telegraph finale (#64) reuses the finale's wall plates: one dial a Deck
// on the first row, read-outs named for what they are, the other rows inert.
describe("displayText for helm and telegraph", () => {
  const wheelhouse = { range: [-6, 6] as const, trims: [3], readings: [12, 6], holdMs: null, names: { dial: "Helm", gauges: ["Heading", "Speed"] } };
  const engine = { range: [0, 8] as const, valves: [4], names: { dial: "Telegraph" } };

  it("the Wheelhouse reads heading with the helm, then speed, and a third row stays blank", () => {
    expect(displayText(d("gauge", 0), wheelhouse)).toBe("Heading 12  helm 3");
    expect(displayText(d("gauge", 1), wheelhouse)).toBe("Speed 6 kn");
    expect(displayText(d("gauge", 2), wheelhouse)).toBe("");
  });

  it("the Engine Room reads its telegraph stop and nothing else", () => {
    expect(displayText(d("valve", 0), engine)).toBe("Telegraph 4");
    expect(displayText(d("valve", 1), engine)).toBe("");
  });
});

describe("controlLive", () => {
  it("a control past the dials the live instrument has is not live", () => {
    const control = { kind: "turn-valve" as const, index: 2, by: 1 as const };
    expect(controlLive(control, { range: [0, 9], valves: [1, 2, 3] })).toBe(true);
    expect(controlLive(control, { range: [0, 8], valves: [4] })).toBe(false);
    expect(controlLive({ kind: "turn-trim", index: 0, by: -1 }, { range: [-6, 6], trims: [3] })).toBe(true);
  });
});

describe("the Room still carries the finale's first-row controls on both Decks", () => {
  it("has a telegraph pair in the Engine Room and a helm pair in the Wheelhouse on the first row", () => {
    expect(roomForDeck("Lower Deck").things.filter((t) => t.control?.index === 0).map((t) => t.control!.kind)).toEqual(["turn-valve", "turn-valve"]);
    expect(roomForDeck("Upper Deck").things.filter((t) => t.control?.index === 0).map((t) => t.control!.kind)).toEqual(["turn-trim", "turn-trim"]);
  });
});
