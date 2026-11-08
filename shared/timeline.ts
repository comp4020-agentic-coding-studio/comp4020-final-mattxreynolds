// The voyage strip's pure layout: turning points picked from the debrief
// timeline, label lanes, and the strip geometry. Used by the client debrief
// (client/ui/Debrief.tsx) and the server-rendered log page (server/pages.ts),
// so both draw the same strip.

import type { Debrief } from "./protocol.ts";

export const ROMAN = ["", "I", "II", "III", "IV", "V"];

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export type MarkKind = "bad" | "good" | "peak" | "end";
export type Mark = { t: number; kind: MarkKind; label: string; detail: string };

/** Short strip labels for the events that turned the voyage. */
const MARK_LABEL: Record<string, [string, MarkKind]> = {
  trip: ["BREAKER TRIP", "bad"],
  gridTrip: ["GENERATOR TRIP", "bad"],
  burst: ["PUMP BURST", "bad"],
  lost: ["COMPARTMENT LOST", "bad"],
  callMissed: ["CALL MISSED", "bad"],
  wrongStation: ["WRONG STATION", "bad"],
  fireIgnite: ["FIRE", "bad"],
  fireBurnout: ["FLASHOVER", "bad"],
  davits: ["DAVITS DROPPED", "bad"],
  powerOnline: ["POWER ON", "good"],
  contact: ["MAYDAY HEARD", "good"],
  floodStable: ["HULL SHORED", "good"],
  fireOut: ["FIRE OUT", "good"],
  doorOpen: ["DOOR OPEN", "good"],
};

/** The events worth marking on the strip, merged when they bunch up, plus
 * the closest call and the end. Pure, shared by the client and the server-rendered log page. */
export function turningPoints(d: Debrief): Mark[] {
  const dur = Math.max(1000, d.durationMs);
  const marks: (Mark & { k: string; n: number })[] = [];
  for (const e of d.events) {
    const def = Object.hasOwn(MARK_LABEL, e.k) ? MARK_LABEL[e.k] : null;
    if (!def) continue;
    if (e.k === "lost" && !/flooded completely/.test(e.text)) continue; // the final loss is the end marker
    const prev = marks.findLast((m) => m.k === e.k);
    if (prev && e.t - prev.t < dur * 0.06) {
      prev.n++;
      continue;
    }
    marks.push({ t: e.t, kind: def[1], label: def[0], detail: e.text, k: e.k, n: 1 });
  }
  const peak = d.samples.reduce<Debrief["samples"][number] | null>((b, s) => (!b || s.danger > b.danger ? s : b), null);
  if (peak && peak.danger >= 25 && peak.danger < 100) {
    marks.push({ t: peak.t, kind: "peak", label: `CLOSEST CALL ${Math.round(peak.danger)}%`, detail: "The worst the flooding got", k: "peak", n: 1 });
  }
  const out = marks
    .sort((a, b) => a.t - b.t)
    .slice(0, 14)
    .map(({ t, kind, label, detail, n }) => ({ t, kind, detail, label: n > 1 ? `${label} ×${n}` : label }));
  out.push({ t: d.durationMs, kind: "end", label: d.result === "SURVIVED" ? "ESCAPED" : "SHIP LOST", detail: d.result === "SURVIVED" ? "Both crew off together" : "The flooding reached 100%" });
  return out;
}

export const SW = 720;
export const SH = 228;
export const SP = { l: 36, r: 14, t: 36, b: 148 };
export const TRACK = 164;
export const LANES = [184, 200, 216];
export const LABEL_W = (s: string) => s.length * 6 + 8;

/** Label lanes: the end and the closest call claim a row first, then the
 * rest in time order, each in the first row where it overlaps nothing. A
 * label that fits nowhere is dropped (lane -1); its glyph and tooltip stay. */
export function laneOf(marks: { x: number; label: string; kind: MarkKind }[], width: number): { lane: number; anchor: "start" | "middle" | "end"; lx: number }[] {
  const taken: [number, number][][] = LANES.map(() => []);
  const out: { lane: number; anchor: "start" | "middle" | "end"; lx: number }[] = [];
  const order = marks.map((_, i) => i).sort((a, b) => Number(marks[b].kind === "end" || marks[b].kind === "peak") - Number(marks[a].kind === "end" || marks[a].kind === "peak") || a - b);
  for (const i of order) {
    const { x, label } = marks[i];
    const w = LABEL_W(label);
    const anchor = x - w / 2 < 4 ? "start" : x + w / 2 > width - 4 ? "end" : "middle";
    const left = anchor === "start" ? x - 4 : anchor === "end" ? x - w + 4 : x - w / 2;
    const right = left + w;
    const lane = taken.findIndex((row) => row.every(([l, r]) => right + 10 < l || left > r + 10));
    if (lane >= 0) taken[lane].push([left, right]);
    out[i] = { lane, anchor, lx: anchor === "start" ? x - 4 : anchor === "end" ? x + 4 : x };
  }
  return out;
}
