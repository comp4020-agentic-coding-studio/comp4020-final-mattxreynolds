// The whole game in two independent browser contexts, driven only through
// the rooms' real controls (window.__btw.use = the same path as pressing E).
// The test reads the hidden answers through the test hook so it can play the
// part of two people talking; the game itself never gets a shortcut.
//
// Needs test hooks (to read the hidden puzzle config), so it skips against
// an app started without them (e.g. CI's production image).

import { afterAll, describe, expect, inject, it } from "vitest";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import { closeBrowser, createViaUi, joinViaLink, profile, skipIntro, use, viewOf, waitView, type Profile } from "./helpers/browser.ts";
import type { Page } from "playwright";
import { hidden, testHooks } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
const profiles: Profile[] = [];
afterAll(async () => {
  for (const p of profiles) await p.context.close();
  await closeBrowser();
});

describe.skipIf(!testHooks())("a full voyage through the real controls", () => {
  it("five acts: prologue → power → flood → radio → cascade → escape → survived → debrief → log → sail again", { timeout: 300_000 }, async () => {
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
    // the opening cinematic plays for both; each skips it
    await Promise.all([skipIntro(E), skipIntro(N)]);

    // Prologue
    await use(E, "prologue-lever");
    await waitView(N, "v.prologue.busOn");
    await use(N, "prologue-ack");
    await waitView(E, "v.phase === 'POWER'");
    const cfg = await hidden(baseUrl, code);

    // Emergency power: one wrong move first (the short), then the answer
    await use(E, `breaker-${cfg.config.power.shorted}`);
    await waitView(N, "v.power.tripped === true");
    await waitView(E, "v.power.tripped === false", 10000);
    for (const i of cfg.config.power.solution) {
      await use(E, `breaker-${i}`);
      await waitView(N, `v.phase !== 'POWER' || Object.values(v.power.fed).filter(Boolean).length >= 1`);
    }
    await waitView(N, "v.phase === 'FLOOD'");

    // Flood control: the Navigator's pump visibly moves the Engineer's gauge
    const pumpTo: string[] = cfg.config.flood.pumpTo;
    const pumpOf = (c: string) => pumpTo.indexOf(c);
    const [c1] = COMPARTMENTS;
    await use(N, `pump-${pumpOf(c1)}`);
    await waitView(E, `v.flood.valves.${c1}.pressure > 5`, 4000);
    await use(N, `pump-${pumpOf(c1)}`); // off again: the crew have learned the wiring
    await waitView(N, `!v.flood.pumps[${pumpOf(c1)}].on`);
    // then play it as a talking crew: the Bridge reads the map, calls the two
    // fullest compartments, and calls "shut it" before a line runs dry
    await floodCrew(E, N, pumpOf, "v.phase === 'FLOOD'", 120_000);
    await waitView(N, "v.phase === 'RADIO'", 10_000);

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
    await waitView(E, "v.phase === 'CASCADE'");

    // Act IV: the Bridge walks into the Comms room (open since Act III), sheds
    // lighting, switches the accumulator on; both chase breaches and calls
    await use(N, "circuit-LIGHTS");
    await waitView(E, "v.ship.circuits.LIGHTS === false");
    await use(N, "circuit-EVAC");
    await waitView(E, "v.ship.circuits.EVAC === true");
    const calls = cfg.config.cascade.calls as { bearing: number }[];
    for (let i = 0; i < 600; i++) {
      const n = await viewOf(N);
      if (n.phase !== "CASCADE") break;
      await floodStepUi(E, N, pumpOf);
      if (n.ship.gridDown) {
        const e = await viewOf(E);
        if (e.grid.resetReady) await use(E, "grid-reset");
      }
      if (n.call) {
        const bearing = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(n.call.bearing);
        expect(calls.map((c) => c.bearing)).toContain(bearing);
        const a = (await viewOf(E)).radio.antenna as number;
        if (a !== bearing) await use(E, (bearing - a + 8) % 8 <= 4 ? "antenna-right" : "antenna-left");
        else await use(N, "answer-call");
      }
      await E.waitForTimeout(250);
    }
    await waitView(E, "v.phase === 'ESCAPE'", 10_000);
    expect((await viewOf(N)).ship.callsAnswered).toBeGreaterThanOrEqual(1);

    // Act V: arm the davits, pump into band, hold the door, abandon together
    await use(N, "arm-davits");
    await waitView(E, "v.ship.armed === true");
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
    // the ending cinematic, then the ending card
    await Promise.all([skipIntro(E), skipIntro(N)]);
    await E.getByTestId("outcome").waitFor();
    expect(await E.getByTestId("outcome").textContent()).toContain("made it off");
    // the debrief reconstruction is built from the real run
    await N.getByTestId("debrief-tab").click();
    await N.getByTestId("debrief").waitFor();
    expect(await N.getByTestId("debrief").textContent()).toContain("Act IV — Cascade");

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

/** One pass of a talking crew on the pumps, through the real controls: the
 * Bridge's map decides which two compartments get a pump; anything near dry
 * is shut. Valve and pump toggles go through the latched controls, so only
 * press when the state differs. */
async function floodStepUi(E: Page, N: Page, pumpOf: (c: string) => number): Promise<void> {
  const n = await viewOf(N);
  const e = await viewOf(E);
  if (!["FLOOD", "CASCADE", "ESCAPE", "RADIO"].includes(n.phase)) return;
  const want = COMPARTMENTS.filter((c) => !n.ship.lost[c] && n.flood.levels[c] > 9)
    .sort((a, b) => n.flood.levels[b] - n.flood.levels[a])
    .slice(0, 2);
  for (const c of COMPARTMENTS) {
    const p = pumpOf(c);
    if (!want.includes(c)) {
      if (n.flood.pumps[p].on) await use(N, `pump-${p}`);
      if (e.flood.valves[c].open) await use(E, `valve-${c}`);
    }
  }
  for (const c of want) {
    const p = pumpOf(c);
    if (!e.flood.valves[c].open) await use(E, `valve-${c}`);
    if (!n.flood.pumps[p].on) await use(N, `pump-${p}`);
  }
}

async function floodCrew(E: Page, N: Page, pumpOf: (c: string) => number, until: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await N.evaluate(`(() => { const v = window.__btw?.view(); return v && (${until}); })()`);
    if (!ok) return;
    await floodStepUi(E, N, pumpOf);
    await E.waitForTimeout(400);
  }
}
