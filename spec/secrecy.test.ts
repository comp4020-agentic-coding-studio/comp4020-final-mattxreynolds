// Promise: core puzzles need both players. Each role's view carries only that
// role's half of the information, in every phase (CLAUDE.md invariant 2;
// server/game/views.ts is the boundary). Checked on the wire, against the
// hidden config read through the test hook.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { COMPARTMENTS } from "../shared/glyphs.ts";
import { PHASES, type Phase, type View } from "../shared/protocol.ts";
import { hidden, jump, launch, type Player } from "./helpers/client.ts";
import { startServer, type TestServer } from "./helpers/server.ts";

let server: TestServer;
let open: Player[] = [];
beforeAll(async () => {
  server = await startServer({ testHooks: true });
});
afterEach(() => {
  open.forEach((p) => p.close());
  open = [];
});
afterAll(async () => {
  await server?.dispose();
});

/** Every key path in a JSON value, e.g. "power.breakers.0.load". */
function paths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return [p, ...paths(v, p)];
  });
}
const keys = (value: unknown): Set<string> => new Set(paths(value).map((p) => p.split(".").pop()!));

// Keys that would carry the other role's knowledge, at any depth.
const ENGINEER_MUST_NOT_HAVE = [
  "diagram", "feeders", "shorted", "fed",
  "levels", "trends", "pumps", "pumpTo", "pumpGlyphs",
  "channel", "stations", "bearing", "target", "signal", "lastReply",
  "band", "status", "held",
];
const NAVIGATOR_MUST_NOT_HAVE = [
  "breakers", "load", "capacity",
  "valves", "pressure", "engineLevel",
  "resonance", "lock", "pulse", "antenna",
];
const NOBODY_GETS = ["config", "seed", "token", "token_hash", "solution", "inflow", "abandonAt", "lastTickAt", "id"];

// Every live phase, plus the lobby and both endings.
const CHECKED: Phase[] = [...PHASES];

describe("each role's view holds only its half of the puzzle, in every phase", () => {
  let eng: Player;
  let nav: Player;
  let cfg: any;

  beforeAll(async () => {
    [eng, nav] = await launch(server.url);
    cfg = (await hidden(server.url, eng.code)).config;
  });
  afterAll(() => {
    eng?.close();
    nav?.close();
  });

  for (const phase of CHECKED) {
    it(`${phase}: Engineer and Navigator views keep each other's secrets`, async () => {
      const extra: Record<string, unknown> =
        phase === "RADIO" || phase === "ESCAPE"
          ? // coupled, so the Engineer's pulse lamp is live: the one moment its
            // view carries any radio pattern at all
            { radio: { coupled: true, channel: cfg.radio.resonance } }
          : {};
      await jump(server.url, [eng, nav], { phase, ...extra, paused: false });
      const e = eng.view as View;
      const n = nav.view as View;
      expect(e.you).toBe("ENGINEER");
      expect(n.you).toBe("NAVIGATOR");

      const ek = keys(e);
      const nk = keys(n);
      for (const k of ENGINEER_MUST_NOT_HAVE) expect(ek.has(k), `Engineer view has "${k}"`).toBe(false);
      for (const k of NAVIGATOR_MUST_NOT_HAVE) expect(nk.has(k), `Navigator view has "${k}"`).toBe(false);
      for (const k of NOBODY_GETS) {
        expect(ek.has(k), `Engineer view has "${k}"`).toBe(false);
        expect(nk.has(k), `Navigator view has "${k}"`).toBe(false);
      }

      // Engineer: only the engine-bay water level, as one number
      const ePaths = paths(e);
      for (const c of COMPARTMENTS) {
        if (c !== "ENGINE") expect(ePaths.some((p) => p.endsWith(`.levels.${c}`) || p.endsWith(`Level${c}`))).toBe(false);
      }
      expect(Object.keys((e as any).flood).sort()).toEqual(["engineLevel", "stable", "valves"]);

      const eJson = JSON.stringify(e);
      const nJson = JSON.stringify(n);
      // the pump → compartment wiring is never sent, in any order or form
      expect(eJson).not.toContain(JSON.stringify(cfg.flood.pumpTo));
      expect(nJson).not.toContain(JSON.stringify(cfg.flood.pumpTo));
      // which breaker is shorted: breakers carry glyph, load and state only
      // (glyph strings are shared with the Bridge's diagram by design, so the
      // check is structural)
      for (const b of (e as any).power.breakers) expect(Object.keys(b).sort()).toEqual(["closed", "glyph", "load"]);
      expect(Object.keys((e as any).power).sort()).toEqual(["breakers", "capacity", "load", "online", "tripped"]);
      expect(Object.keys((e as any).radio).sort()).toEqual(["antenna", "contact", "coupled", "lock", "pulse", "resonance"]);
      expect(Object.keys((e as any).escape).sort()).toEqual(["door", "partnerAbandon", "pressure", "youAbandon"]);
      // the escape band is the Bridge's; the Engineer has the numbers but no marks
      expect(eJson).not.toContain(JSON.stringify(cfg.escape.band));
      // the antenna bearing of the target station is never sent as a compass word to the Engineer
      expect(eJson).not.toMatch(/"(N|NE|E|SE|S|SW|W|NW)"/);

      // Navigator: no Engineer-only numbers
      expect(Object.keys((n as any).power).sort()).toEqual(["diagram", "fed", "online", "shorted", "tripped"]);
      expect(Object.keys((n as any).radio).sort()).toEqual(["channel", "contact", "coupled", "lastReply", "signal", "stations"]);
      expect(Object.keys((n as any).escape).sort()).toEqual(["band", "door", "held", "partnerAbandon", "status", "youAbandon"]);
      // the target is not marked among the stations
      for (const s of (n as any).radio.stations) expect(Object.keys(s).sort()).toEqual(["bearing", "glyph", "pattern"]);

      // tokens never travel
      expect(eJson).not.toContain(eng.token);
      expect(eJson).not.toContain(nav.token);
      expect(nJson).not.toContain(eng.token);
      expect(nJson).not.toContain(nav.token);
    });
  }
});
