// The voyage strip's shared layout (shared/timeline.ts): turning points and
// label lanes, used by both the client debrief and the server log page.

import { describe, expect, it } from "vitest";
import type { Debrief } from "../shared/protocol.ts";
import { clock, laneOf, LABEL_W, SW, turningPoints } from "../shared/timeline.ts";

function debrief(over: Partial<Debrief> = {}): Debrief {
  return {
    durationMs: 600_000,
    result: "SURVIVED",
    events: [],
    samples: [],
    actTimes: {},
    ...over,
  } as Debrief;
}

describe("timeline", () => {
  it("formats a clock", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(61_400)).toBe("01:01");
    expect(clock(-5)).toBe("00:00");
  });

  it("merges bunched events of one kind and always ends with the outcome", () => {
    const d = debrief({
      events: [
        { t: 10_000, k: "trip", text: "Breaker tripped" },
        { t: 12_000, k: "trip", text: "Breaker tripped" },
        { t: 200_000, k: "trip", text: "Breaker tripped" },
        { t: 50_000, k: "powerOnline", text: "Power on" },
        { t: 60_000, k: "unknownKind", text: "ignored" },
      ] as Debrief["events"],
    });
    const marks = turningPoints(d);
    expect(marks.map((m) => m.label)).toEqual(["BREAKER TRIP ×2", "POWER ON", "BREAKER TRIP", "ESCAPED"]);
    expect(marks.at(-1)).toMatchObject({ kind: "end", t: 600_000 });
  });

  it("adds a closest-call marker only for a real near miss", () => {
    const peakAt = (danger: number) =>
      turningPoints(debrief({ samples: [{ t: 1000, danger: 10 }, { t: 2000, danger }] as Debrief["samples"] })).find((m) => m.kind === "peak");
    expect(peakAt(80)?.label).toBe("CLOSEST CALL 80%");
    expect(peakAt(20)).toBeUndefined();
    expect(turningPoints(debrief({ result: "LOST" })).at(-1)?.label).toBe("SHIP LOST");
  });

  it("puts overlapping labels in different lanes and keeps edge labels inside the strip", () => {
    const marks = [
      { x: 100, label: "BREAKER TRIP", kind: "bad" as const },
      { x: 110, label: "PUMP BURST", kind: "bad" as const },
      { x: SW - 2, label: "ESCAPED", kind: "end" as const },
      { x: 2, label: "FIRE", kind: "bad" as const },
    ];
    const lanes = laneOf(marks, SW);
    expect(lanes[0].lane).not.toBe(lanes[1].lane);
    expect(lanes[2]).toMatchObject({ lane: 0, anchor: "end" });
    expect(lanes[3].anchor).toBe("start");
    expect(lanes[2].lx - LABEL_W("ESCAPED")).toBeGreaterThan(0);
  });
});
