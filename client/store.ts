// Client state: the latest server View plus local UI state. The scene reads
// animated values with useStore.getState() inside useFrame (no re-render).

import { create } from "zustand";
import type { Fx, View } from "../shared/protocol.ts";

export type Screen = "home" | "join" | "voyage";
export type Conn = "idle" | "connecting" | "online" | "offline";

export type Toast = { id: number; text: string; tone: "info" | "warn" };

type State = {
  screen: Screen;
  code: string | null;
  conn: Conn;
  view: View | null;
  /** Pointer lock / "on the controls" vs the briefing/pause card. */
  locked: boolean;
  prompt: string | null;
  toasts: Toast[];
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
  /** Bumped by the R key on the pause card to send the player back to spawn. */
  respawn: number;
  lastFx: { fx: Fx; at: number }[];
  /** The 3D room has finished its first-load shader compile. */
  sceneReady: boolean;
};

export const useStore = create<State>(() => ({
  screen: "home",
  code: null,
  conn: "idle",
  view: null,
  locked: false,
  prompt: null,
  toasts: [],
  muted: false,
  volume: 0.7,
  reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  respawn: 0,
  lastFx: [],
  sceneReady: false,
}));

let toastId = 0;
export function toast(text: string, tone: Toast["tone"] = "info", ms = 2600): void {
  const id = ++toastId;
  useStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

type FxListener = (fx: Fx) => void;
const fxListeners = new Set<FxListener>();
/** Subscribe to one-shot effects (sounds, sparks, steam). Returns unsubscribe. */
export function onFx(fn: FxListener): () => void {
  fxListeners.add(fn);
  return () => fxListeners.delete(fn);
}
export function emitFx(fx: Fx): void {
  for (const fn of fxListeners) fn(fx);
}
