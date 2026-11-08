// Input state shared by every way of driving the player: keyboard + mouse
// (Player.tsx, pointer lock) and touch (ui/TouchControls.tsx). Module-level
// and mutable, read inside useFrame: never React state (no per-frame renders).
//
// Pressing a control always goes through press()/release() here, so E, a
// left click, the on-screen USE button and a tap on the control itself share
// one debounce and one hold.

import { interactables } from "./interact.tsx";

/** A second press on the same control inside this window is the same intent
 * (E and a click together, a bouncing key, a tap that also hit USE), not a new one. */
const PRESS_DEBOUNCE_MS = 120;

export const input = {
  /** The interactable under the reticle this frame (Player sets it), or null. */
  aimed: null as string | null,
  /** Touch move stick: x = strafe right, y = forward, each −1..1, magnitude ≤ 1. */
  stick: { x: 0, y: 0 },
  /** Touch look drag not yet applied to the camera, in radians (Player drains it). */
  look: { yaw: 0, pitch: 0 },
  /** Set by Player: the enabled interactable at a screen point (NDC), within reach. */
  pick: null as ((ndcX: number, ndcY: number) => string | null) | null,
};

let holding: { id: string; source: "aim" | "tap" } | null = null;
let last = { id: "", at: 0 };

/** Uses a control (the aimed one by default): onUse, and onHold(true) for
 * hold-controls until release(). `source: "tap"` marks a hold on a control
 * touched directly, which isn't released when the reticle drifts off it. */
export function press(id: string | null = input.aimed, source: "aim" | "tap" = "aim"): boolean {
  if (!id) return false;
  const now = performance.now();
  if (last.id === id && now - last.at < PRESS_DEBOUNCE_MS) return false;
  last = { id, at: now };
  const entry = interactables.get(id);
  if (!entry || entry.def.disabled) return false;
  if (entry.def.onHold) {
    if (holding && holding.id !== id) release();
    holding = { id, source };
    entry.def.onHold(true);
  }
  entry.def.onUse?.();
  return true;
}

/** Ends any hold in progress. Safe to call when nothing is held. */
export function release(): void {
  const h = holding;
  holding = null;
  if (h) interactables.get(h.id)?.def.onHold?.(false);
}

/** Called each frame with the aimed control: a hold that began at the
 * reticle ends when the reticle leaves its control. */
export function aimChanged(id: string | null): void {
  if (holding?.source === "aim" && holding.id !== id) release();
}

/** True if the control only does something while held (no onUse). */
export function isHoldOnly(id: string): boolean {
  const def = interactables.get(id)?.def;
  return Boolean(def?.onHold && !def.onUse);
}

/** Drops all touch movement and any hold (pause, tab hidden, mode switch). */
export function resetTouch(): void {
  input.stick.x = 0;
  input.stick.y = 0;
  input.look.yaw = 0;
  input.look.pitch = 0;
  release();
}
