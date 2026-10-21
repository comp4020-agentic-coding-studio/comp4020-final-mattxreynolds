// Bridge-local helpers: typed view selectors, phase gating, and the one-shot
// effect clock that screens read in useFrame (no React state per frame).

import { useMemo } from "react";
import { useStore } from "../../store.ts";
import type { Fx, NavigatorView, Phase } from "../../../shared/protocol.ts";

/** The current view if (and only if) it is a Navigator view. */
export const navView = (): NavigatorView | null => {
  const v = useStore.getState().view;
  return v && v.you === "NAVIGATOR" ? v : null;
};

/** Narrow selector over the Navigator view; re-renders only when `pick` changes (by ===). */
export function useNav<T>(pick: (v: NavigatorView) => T, fallback: T): T {
  return useStore((s) => (s.view && s.view.you === "NAVIGATOR" ? pick(s.view) : fallback));
}

const ORDER: Phase[] = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "ESCAPE", "SURVIVED", "LOST"];

/** How a station for `own` phase should present itself right now. */
export type StationMode = "dead" | "standby" | "active" | "done";

export function stationMode(phase: Phase, busOn: boolean, own: Phase, reached?: Phase): StationMode {
  if (!busOn && (phase === "PROLOGUE" || phase === "LOBBY")) return "dead";
  if (phase === "SURVIVED") return "done";
  // on a loss, stations before the phase that failed are done; the rest never woke
  const p = ORDER.indexOf(phase === "LOST" ? (reached ?? "ESCAPE") : phase);
  const o = ORDER.indexOf(own);
  if (phase === "LOST") return o < p ? "done" : "standby";
  return p < o ? "standby" : p === o ? "active" : "done";
}

/** Hook form: subscribes to just phase + busOn (+ phase reached on a loss). */
export function useStationMode(own: Phase): StationMode {
  const phase = useNav((v) => v.phase, "PROLOGUE" as Phase);
  const busOn = useNav((v) => v.prologue.busOn, false);
  const reached = useNav((v) => v.outcome?.phaseReached, undefined as Phase | undefined);
  return stationMode(phase, busOn, own, reached);
}

// ------------------------------------------------------------ fx clock

/** Seconds (performance.now based) at which each fx kind last fired. */
export const fxClock: Partial<Record<Fx["k"], number>> & { burstAt?: number } = {};
export const nowS = (): number => performance.now() / 1000;
export const since = (k: Fx["k"]): number => {
  const t = fxClock[k];
  return t === undefined ? Infinity : nowS() - t;
};

/** Like useNav, but for object slices: compares by JSON so a fresh view
 * object with identical data does not re-render (or redraw a canvas). */
export function useNavSlice<T>(pick: (v: NavigatorView) => T, fallback: T): T {
  const key = useNav((v) => JSON.stringify(pick(v)), JSON.stringify(fallback));
  return useMemo(() => JSON.parse(key) as T, [key]);
}
