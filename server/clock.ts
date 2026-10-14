// The Clock (#23, #49): a pure function of stored state and now(), compared
// lazily. Nothing ticks; whoever needs the time left asks for it.
export const CLOCK_MS = 30 * 60_000;
export const STRIKE_MS = 3 * 60_000;
export const MAX_STRIKES = 3;

export interface ClockState {
  /** When the Voyage cast off (ms since epoch). */
  startedAt: number;
  strikes: number;
}

/** Time left in ms; negative once the Clock has run past zero. */
export function timeLeftMs(state: ClockState, now: number): number {
  return CLOCK_MS - state.strikes * STRIKE_MS - (now - state.startedAt);
}

import type { DatabaseSync } from "node:sqlite";
import { logEvent } from "./events.ts";

interface Row {
  cast_off_at: number | null;
  strikes: number;
  outcome: string | null;
}

const rowOf = (db: DatabaseSync, voyageId: string): Row =>
  db.prepare("SELECT cast_off_at, strikes, outcome FROM voyage WHERE id = ?").get(voyageId) as unknown as Row;

/** Time left on a started, unfinished Voyage's Clock in ms, or null before cast off. */
export function clockLeftMs(db: DatabaseSync, voyageId: string, now: number): number | null {
  const row = rowOf(db, voyageId);
  return row.cast_off_at === null ? null : timeLeftMs({ startedAt: row.cast_off_at, strikes: row.strikes }, now);
}

function sink(db: DatabaseSync, voyageId: string, now: number, reason: "strikes" | "clock"): void {
  db.prepare("UPDATE voyage SET outcome = 'sank', ended_at = ? WHERE id = ? AND outcome IS NULL").run(now, voyageId);
  logEvent(db, { voyageId, at: now, action: "voyage.sank", detail: { reason } });
}

/** Sinks the ship if the third Strike or zero on the Clock is due. True only when it sank just now. */
export function settleClock(db: DatabaseSync, voyageId: string, now: number): boolean {
  const row = rowOf(db, voyageId);
  if (row.outcome !== null || row.cast_off_at === null) return false;
  if (row.strikes >= MAX_STRIKES) return sink(db, voyageId, now, "strikes"), true;
  if (timeLeftMs({ startedAt: row.cast_off_at, strikes: row.strikes }, now) <= 0) return sink(db, voyageId, now, "clock"), true;
  return false;
}

export type LaunchResult = { kind: "launched"; scoreMs: number } | { kind: "sank" } | { kind: "refused" };

/**
 * A launch the server accepts with time left wins, and the time left is the
 * Score (#23). Anything at or after zero sinks instead. Only the server calls
 * this, from a rule it has judged; no intent carries a time or a Score.
 */
export function launch(db: DatabaseSync, voyageId: string, now: number): LaunchResult {
  const row = rowOf(db, voyageId);
  if (row.outcome !== null || row.cast_off_at === null) return { kind: "refused" };
  if (settleClock(db, voyageId, now)) return { kind: "sank" };
  const scoreMs = timeLeftMs({ startedAt: row.cast_off_at, strikes: row.strikes }, now);
  db.prepare("UPDATE voyage SET outcome = 'launched', score_ms = ?, ended_at = ? WHERE id = ?").run(scoreMs, now, voyageId);
  logEvent(db, { voyageId, at: now, action: "voyage.launched", detail: { score_ms: scoreMs, strikes: row.strikes } });
  return { kind: "launched", scoreMs };
}

/** What a snapshot says about the Clock: whole seconds left, never below zero, null before cast off. */
export function clockView(db: DatabaseSync, voyageId: string, now: number): { secondsLeft: number } | null {
  const ms = clockLeftMs(db, voyageId, now);
  return ms === null ? null : { secondsLeft: Math.max(0, Math.floor(ms / 1000)) };
}
