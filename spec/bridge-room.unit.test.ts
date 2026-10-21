// Bridge client logic that needs no browser: station gating per phase and the
// Comms Room door in the collision layout.

import { describe, expect, it } from "vitest";
import { stationMode } from "../client/scene/bridge/state.ts";
import { BRIDGE_LAYOUT } from "../client/scene/Bridge.tsx";
import { moveWithCollision } from "../client/scene/colliders.ts";
import { useStore } from "../client/store.ts";

describe("bridge station modes", () => {
  it("keeps the flood console active wherever pumps are accepted", () => {
    for (const p of ["FLOOD", "RADIO", "CASCADE", "ESCAPE"] as const) expect(stationMode(p, true, "FLOOD", undefined, "ESCAPE")).toBe("active");
    expect(stationMode("POWER", true, "FLOOD", undefined, "ESCAPE")).toBe("standby");
    expect(stationMode("SURVIVED", true, "FLOOD", undefined, "ESCAPE")).toBe("done");
  });
  it("the radio desk is active only in RADIO", () => {
    expect(stationMode("RADIO", true, "RADIO")).toBe("active");
    expect(stationMode("CASCADE", true, "RADIO")).toBe("done");
    expect(stationMode("FLOOD", true, "RADIO")).toBe("standby");
    expect(stationMode("LOST", true, "RADIO", "CASCADE")).toBe("done");
  });
});

describe("comms room door", () => {
  const walkThrough = () => {
    // from the Bridge, aim at the doorway (z 0…1.2) and walk east
    let [x, z] = [4.0, 0.6];
    for (let i = 0; i < 60; i++) [x, z] = moveWithCollision(BRIDGE_LAYOUT, x, z, 0.1, 0);
    return x;
  };
  const setPhase = (phase: string) => useStore.setState({ view: { you: "NAVIGATOR", phase, outcome: null } as never });

  it("is solid before the distress phase", () => {
    setPhase("FLOOD");
    expect(walkThrough()).toBeLessThan(5);
  });
  it("opens from RADIO and leads into the Comms Room", () => {
    setPhase("RADIO");
    const x = walkThrough();
    expect(x).toBeGreaterThan(6);
    expect(x).toBeLessThan(9.9);
  });
  it("spawn stays on the Bridge", () => {
    expect(BRIDGE_LAYOUT.spawn[0]).toBeLessThan(5);
  });
});
