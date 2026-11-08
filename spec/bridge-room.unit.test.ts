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

describe("exterior sea containment", async () => {
  const { SHIP_FOOTPRINT } = await import("../client/scene/bridge/Exterior.tsx");
  const { ROOM } = await import("../client/scene/bridge/Room.tsx");
  const { COMMS } = await import("../client/scene/bridge/Comms.tsx");
  const inside = (x: number, z: number) => SHIP_FOOTPRINT.some(([cx, cz, hx, hz]) => Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz);
  it("the sea mask covers the whole Bridge, Comms Room and foredeck so crests never rise through a floor", () => {
    // regression: the sea plane ran under the Bridge's forward half and storm
    // crests rose ~1.3 m through the floor
    const rects = [
      [-ROOM.w / 2, ROOM.w / 2, -ROOM.d / 2, ROOM.d / 2],
      [COMMS.x0, COMMS.x1, COMMS.z0, COMMS.z1],
      [-4.7, 4.7, -22.3, -4.3], // foredeck hull (Exterior.tsx: DECK_Z0 - 18, 9.4 wide)
    ];
    for (const [x0, x1, z0, z1] of rects)
      for (let x = x0; x <= x1 + 1e-9; x += (x1 - x0) / 10) for (let z = z0; z <= z1 + 1e-9; z += (z1 - z0) / 10) expect(inside(x, z), `${x},${z}`).toBe(true);
  });
});

describe("exterior sea shader", () => {
  it("the generated GLSL balances its brackets on every line", async () => {
    // regression: the footprint mask was spliced in with a missing ')', so the
    // sea never compiled; production disables three's shader checks, so the
    // only symptom was a missing sea
    const { seaMat } = await import("../client/scene/bridge/Exterior.tsx");
    for (const src of [seaMat.vertexShader, seaMat.fragmentShader])
      for (const line of src.split("\n")) {
        const code = line.replace(/\/\/.*$/, "");
        const count = (c: string) => code.split(c).length - 1;
        expect(count("("), line.trim()).toBe(count(")"));
      }
  });
});
