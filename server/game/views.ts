// The secrecy boundary: canonical Voyage → what one role is allowed to see.
// Anything not copied here never leaves the server (CLAUDE.md invariant 2).

import { DANGER } from "../../shared/config.ts";
import { BEARINGS, COMPARTMENTS, type Compartment } from "../../shared/glyphs.ts";
import {
  ROLES,
  type CommonView,
  type EngineerView,
  type FloodTrend,
  type NavigatorView,
  type Role,
  type View,
} from "../../shared/protocol.ts";
import { escapeInBand, powerLoad, powerTripped, resonance, stationAt, systemsFed, type Voyage } from "./voyage.ts";

export type Presence = Partial<Record<Role, boolean>>;

export function trendOf(v: Voyage): FloodTrend {
  if (v.danger >= DANGER.criticalAt) return "CRITICAL";
  return v.dangerRate > DANGER.stableRate ? "RISING" : "STABLE";
}

const round = (n: number): number => Math.round(n * 10) / 10;

function common(v: Voyage, you: Role, presence: Presence, rev: number): CommonView {
  return {
    rev,
    code: v.code,
    you,
    phase: v.phase,
    crew: ROLES.filter((r) => v.seats[r]).map((r) => ({
      role: r,
      callsign: v.seats[r]!.callsign,
      connected: Boolean(presence[r]),
      ready: v.seats[r]!.ready,
    })),
    danger: round(v.danger),
    trend: trendOf(v),
    paused: v.paused,
    elapsedMs: Math.round(v.elapsedMs),
    outcome:
      v.phase === "SURVIVED" || v.phase === "LOST"
        ? {
            result: v.phase,
            failureCause: v.failureCause,
            phaseReached: v.phase === "LOST" ? lostPhase(v) : "ESCAPE",
            durationMs: Math.round(v.elapsedMs),
            mistakes: v.mistakes,
            nextCode: v.nextCode,
          }
        : null,
    prologue: { ...v.prologue },
  };
}

function lostPhase(v: Voyage): CommonView["phase"] {
  return v.deepestPhase === "SURVIVED" ? "ESCAPE" : v.deepestPhase;
}

export function engineerView(v: Voyage, presence: Presence, rev: number, now: number): EngineerView {
  const pulse = v.radio.coupled ? v.config.radio.stations[v.config.radio.target].pattern : null;
  return {
    ...common(v, "ENGINEER", presence, rev),
    you: "ENGINEER",
    power: {
      breakers: v.config.power.breakers.map((b, i) => ({ glyph: b.glyph, load: b.load, closed: v.power.closed[i] })),
      load: powerLoad(v),
      tripped: powerTripped(v, now),
      online: v.power.online,
    },
    flood: {
      valves: Object.fromEntries(
        COMPARTMENTS.map((c) => [c, { open: v.flood.valves[c], pressure: Math.round(v.flood.pressure[c]) }]),
      ) as EngineerView["flood"]["valves"],
      engineLevel: round(v.flood.levels.ENGINE),
      stable: v.flood.stable,
    },
    radio: {
      resonance: round(resonance(v)),
      lock: v.radio.channel === v.config.radio.resonance,
      coupled: v.radio.coupled,
      pulse,
      antenna: v.radio.antenna,
      contact: v.radio.contact,
    },
    escape: {
      pressure: round(v.escape.pressure),
      door: round(v.escape.door),
      youAbandon: v.escape.abandonAt.ENGINEER !== undefined,
      partnerAbandon: v.escape.abandonAt.NAVIGATOR !== undefined,
    },
  };
}

export function navigatorView(v: Voyage, presence: Presence, rev: number, now: number): NavigatorView {
  const p = v.config.power;
  const trend = (c: Compartment): -1 | 0 | 1 => {
    const d = v.flood.levels[c] - v.flood.prevLevels[c];
    return Math.abs(d) < 0.01 ? 0 : d > 0 ? 1 : -1;
  };
  const [lo, hi] = v.config.escape.band;
  const facing = stationAt(v, v.radio.antenna);
  return {
    ...common(v, "NAVIGATOR", presence, rev),
    you: "NAVIGATOR",
    power: {
      diagram: (["PUMPS", "RADIO", "HELM"] as const).map((system) => ({
        system,
        feeders: [p.breakers[p.feeders[system][0]].glyph, p.breakers[p.feeders[system][1]].glyph],
      })),
      shorted: p.breakers[p.shorted].glyph,
      capacity: p.capacity,
      fed: systemsFed(v, now),
      tripped: powerTripped(v, now),
      online: v.power.online,
    },
    flood: {
      levels: Object.fromEntries(COMPARTMENTS.map((c) => [c, round(v.flood.levels[c])])) as NavigatorView["flood"]["levels"],
      trends: Object.fromEntries(COMPARTMENTS.map((c) => [c, trend(c)])) as NavigatorView["flood"]["trends"],
      pumps: v.config.flood.pumpGlyphs.map((glyph, i) => ({ glyph, on: v.flood.pumps[i] })),
      stable: v.flood.stable,
    },
    radio: {
      channel: v.radio.channel,
      coupled: v.radio.coupled,
      stations: v.config.radio.stations.map((s) => ({ glyph: s.glyph, pattern: s.pattern, bearing: BEARINGS[s.bearing] })),
      signal: v.radio.coupled && facing >= 0 ? 1 : v.radio.coupled ? 0.15 : 0,
      contact: v.radio.contact,
      lastReply: v.radio.lastReply,
    },
    escape: {
      band: [lo, hi],
      status: escapeInBand(v) ? "OK" : v.escape.pressure < lo ? "LOW" : "HIGH",
      door: round(v.escape.door),
      held: v.escape.held,
      youAbandon: v.escape.abandonAt.NAVIGATOR !== undefined,
      partnerAbandon: v.escape.abandonAt.ENGINEER !== undefined,
    },
  };
}

export function viewFor(v: Voyage, role: Role, presence: Presence, rev: number, now: number): View {
  return role === "ENGINEER" ? engineerView(v, presence, rev, now) : navigatorView(v, presence, rev, now);
}
