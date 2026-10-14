import type { DatabaseSync } from "node:sqlite";
import type { InstrumentView } from "../shared/draw.ts";
import type { PuzzleVersion, Settings } from "./puzzles/types.ts";

// The live half of a split instrument (#48): one overwritten row per Voyage
// holding the valve and trim levels and when the gauges last entered band.
// The Puzzle version says what in band means; this only stores and reads.

/** Ten continuous seconds in band launch the Lifeboat (#24). */
export const HOLD_MS = 10_000;

export interface Live extends Settings {
  /** When the gauges last entered band, or null while out of band. */
  since: number | null;
}

/** The stored state, or the Puzzle's starting state before any dial has turned. */
export function liveOf(db: DatabaseSync, voyageId: string, version: PuzzleVersion, data: unknown): Live {
  const row = db.prepare("SELECT valves, trims, in_band_since FROM instrument WHERE voyage_id = ?").get(voyageId) as
    | { valves: string; trims: string; in_band_since: number | null }
    | undefined;
  if (!row) return { ...version.instrument!.initial(data), since: null };
  return { valves: JSON.parse(row.valves) as number[], trims: JSON.parse(row.trims) as number[], since: row.in_band_since };
}

export function saveLive(db: DatabaseSync, voyageId: string, live: Live): void {
  db.prepare("INSERT OR REPLACE INTO instrument (voyage_id, valves, trims, in_band_since) VALUES (?, ?, ?, ?)").run(
    voyageId,
    JSON.stringify(live.valves),
    JSON.stringify(live.trims),
    live.since,
  );
}

/** One Deck's half: the Engine Room sees its valves, the Wheelhouse the trims, gauges and hold. Never the target. */
export function instrumentView(
  db: DatabaseSync,
  voyageId: string,
  version: PuzzleVersion,
  data: unknown,
  role: "clue" | "lock",
  now: number,
): InstrumentView {
  const live = liveOf(db, voyageId, version, data);
  const { limits, readings, names } = version.instrument!;
  if (role === "lock") return { range: limits.valves, valves: live.valves, ...(names ? { names: { dial: names.valves } } : {}) };
  return {
    range: limits.trims,
    trims: live.trims,
    readings: readings(data, live),
    holdMs: live.since === null ? null : Math.min(HOLD_MS, now - live.since),
    ...(names ? { names: { dial: names.trims, gauges: names.gauges } } : {}),
  };
}
