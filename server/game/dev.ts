// Development-only ship controls (docs/DEV_MODE.md). Reachable only through
// /api/dev/*, which exists only when the server runs outside production or
// with ENABLE_DEV_TOOLS=1. Pure, like the rest of server/game: callers pass
// `now` and persist/broadcast.
//
// "Skip" never sets v.phase. It satisfies the current phase's own completion
// condition and lets checkProgress() make the normal transition, so a skipped
// phase has the same danger relief, log notes, fx and debrief as a solved one.

import { DANGER, FLOOD } from "../../shared/config.ts";
import { COMPARTMENTS } from "../../shared/glyphs.ts";
import { isPlaying, type Fx } from "../../shared/protocol.ts";
import { checkProgress, lose } from "./voyage.ts";
import { note, type Voyage } from "./state.ts";

export type DevAction = { k: "skip" } | { k: "danger"; value: number } | { k: "lose" };

export function parseDevAction(raw: unknown): DevAction | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.k === "skip" || b.k === "lose") return { k: b.k };
  if (b.k === "danger" && typeof b.value === "number" && Number.isFinite(b.value)) return { k: "danger", value: b.value };
  return null;
}

/** Returns false when the action makes no sense in the current phase. */
export function applyDevAction(v: Voyage, a: DevAction, now: number, fx: Fx[]): boolean {
  if (!isPlaying(v.phase)) return false;
  switch (a.k) {
    case "lose":
      return lose(v, now, fx);
    case "danger":
      v.danger = Math.max(0, Math.min(DANGER.max - 1, a.value));
      return true;
    case "skip":
      note(v, "SHIP", "dev", `[dev] skipped ${v.phase}`);
      solveCurrent(v, now);
      checkProgress(v, now, fx);
      return true;
  }
}

function solveCurrent(v: Voyage, now: number): void {
  switch (v.phase) {
    case "PROLOGUE":
      v.prologue = { busOn: true, acknowledged: true };
      break;
    case "POWER":
      v.power.trippedUntil = 0;
      v.power.closed = v.power.closed.map((_, i) => v.config.power.solution.includes(i));
      break;
    case "FLOOD":
      // the water a clean crew leaves behind (as scenario.ts sets up Act III)
      for (const c of COMPARTMENTS) v.flood.levels[c] = Math.min(v.flood.levels[c], 10 + COMPARTMENTS.indexOf(c) * 3);
      v.flood.held = FLOOD.holdS;
      break;
    case "RADIO":
      v.radio.channel = v.config.radio.resonance;
      v.radio.coupled = true;
      v.radio.antenna = v.config.radio.stations[v.config.radio.target].bearing;
      v.radio.contact = true;
      v.radio.lastReply = "contact";
      break;
    case "CASCADE":
      v.ship.evac = 100;
      break;
    case "ESCAPE":
      v.ship.armed = true;
      v.escape.abandonAt = { ENGINEER: now, NAVIGATOR: now };
      break;
  }
}
