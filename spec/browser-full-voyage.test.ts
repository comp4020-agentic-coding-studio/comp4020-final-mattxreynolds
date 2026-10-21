// The whole game in two independent browser contexts, driven only through
// the rooms' real controls (window.__btw.use = the same path as pressing E).
// The test reads the hidden answers through the test hook so it can play the
// part of two people talking; the game itself never gets a shortcut.
//
// Needs test hooks (to read the hidden puzzle config), so it skips against
// an app started without them (e.g. CI's production image).

import { afterAll, describe, expect, inject, it } from "vitest";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import { closeBrowser, createViaUi, joinViaLink, profile, use, viewOf, waitView, type Profile } from "./helpers/browser.ts";
import { hidden, testHooks } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
const profiles: Profile[] = [];
afterAll(async () => {
  for (const p of profiles) await p.context.close();
  await closeBrowser();
});

describe.skipIf(!testHooks())("a full voyage through the real controls", () => {
  it("prologue → power → flood → radio → escape → survived → log → sail again", { timeout: 180_000 }, async () => {
    const eng = await profile(baseUrl);
    const nav = await profile(baseUrl);
    profiles.push(eng, nav);
    const E = eng.page;
    const N = nav.page;

    const code = await createViaUi(eng, "Ada");
    await joinViaLink(nav, code, "Lin");
    await E.getByTestId("ready").click();
    await N.getByTestId("ready").click();
    await waitView(E, "v.phase === 'PROLOGUE'");

    // Prologue
    await use(E, "prologue-lever");
    await waitView(N, "v.prologue.busOn");
    await use(N, "prologue-ack");
    await waitView(E, "v.phase === 'POWER'");
    const cfg = await hidden(baseUrl, code);

    // Emergency power: one wrong move first (the short), then the answer
    await use(E, `breaker-${cfg.config.power.shorted}`);
    await waitView(N, "v.power.tripped === true");
    await waitView(E, "v.power.tripped === false", 8000);
    for (const i of cfg.config.power.solution) {
      await use(E, `breaker-${i}`);
      await waitView(N, `v.phase !== 'POWER' || Object.values(v.power.fed).filter(Boolean).length >= 1`);
    }
    await waitView(N, "v.phase === 'FLOOD'");

    // Flood control: the Navigator's pump visibly moves the Engineer's gauge
    const pumpTo: string[] = cfg.config.flood.pumpTo;
    const pumpOf = (c: string) => pumpTo.indexOf(c);
    const [c1, c2, c3] = COMPARTMENTS;
    await use(N, `pump-${pumpOf(c1)}`);
    await waitView(E, `v.flood.valves.${c1}.pressure > 5`, 4000);
    await use(E, `valve-${c1}`);
    await use(E, `valve-${c2}`);
    await use(N, `pump-${pumpOf(c2)}`);
    await waitView(N, `v.flood.levels.${c1} < 20 && v.flood.levels.${c2} < 20`, 40_000);
    // hand a pump over to the third compartment
    await use(N, `pump-${pumpOf(c1)}`);
    await use(E, `valve-${c1}`);
    await use(E, `valve-${c3}`);
    await use(N, `pump-${pumpOf(c3)}`);
    await waitView(N, "v.phase === 'RADIO'", 40_000);

    // Distress signal: tune up/down to resonance, couple, aim, transmit
    const target = cfg.config.radio.resonance as number;
    for (;;) {
      const ch = (await viewOf(N)).radio.channel as number;
      if (ch === target) break;
      await use(N, ch < target ? "tune-up" : "tune-down");
      await waitView(N, `v.radio.channel !== ${ch}`);
    }
    await waitView(E, "v.radio.lock === true");
    await use(E, "couple-lever");
    await waitView(E, "v.radio.pulse !== null");
    const station = cfg.config.radio.stations[cfg.config.radio.target];
    for (;;) {
      const a = (await viewOf(E)).radio.antenna as number;
      if (a === station.bearing) break;
      await use(E, (station.bearing - a + 8) % 8 <= 4 ? "antenna-right" : "antenna-left");
      await waitView(E, `v.radio.antenna !== ${a}`);
    }
    await use(N, "transmit");
    await waitView(E, "v.phase === 'ESCAPE'");

    // Final escape: pump into band, hold the door, both abandon together
    const [lo] = cfg.config.escape.band as [number, number];
    await use(N, "door-release", true);
    for (let i = 0; i < 400; i++) {
      const v = await viewOf(E);
      if (v.escape.door >= 100) break;
      if (v.escape.pressure < lo + 5) await use(E, "hand-pump");
      await E.waitForTimeout(150);
    }
    await use(N, "door-release", false);
    await waitView(N, "v.escape.door >= 100");
    await Promise.all([use(E, "abandon-engineer"), use(N, "abandon-navigator")]);
    await waitView(E, "v.phase === 'SURVIVED'");
    await waitView(N, "v.phase === 'SURVIVED'");
    await E.getByTestId("outcome").waitFor();
    expect(await E.getByTestId("outcome").textContent()).toContain("made it off");

    // Ship's log shows the voyage with both callsigns
    const log = await (await fetch(new URL("/history/", baseUrl))).text();
    expect(log).toContain(`VOYAGE ${code}`);
    expect(log).toContain("ADA");
    expect(log).toContain("LIN");

    // Sail again: one click, both move to a new voyage with the same roles
    await N.getByTestId("sail-again").click();
    await waitView(E, `v.code !== '${code}' && v.phase === 'LOBBY' && v.you === 'ENGINEER'`);
    await waitView(N, `v.code !== '${code}' && v.phase === 'LOBBY' && v.you === 'NAVIGATOR'`);
    expect((await viewOf(E)).code).toBe((await viewOf(N)).code);

    expect(eng.errors, eng.errors.join("\n")).toEqual([]);
    expect(nav.errors, nav.errors.join("\n")).toEqual([]);
  });
});
