// Touch play (ADR 008): the pure parts — stick maths, tap detection, prompt
// wording — and the device detector. The on-screen controls themselves are
// ui/TouchControls.tsx; the shared input state is scene/input.ts.

import { useStore } from "../store.ts";

/** Feel of the touch controls. Client-only presentation numbers, like the
 * mouse sensitivity and walk speed in Player.tsx; nothing on the server reads them. */
export const TOUCH = {
  /** Move stick travel in CSS px: a drag this far is full speed. */
  stickRadius: 56,
  /** Fraction of the travel ignored at the centre, so a resting thumb stands still. */
  deadZone: 0.18,
  /** Look drag: radians of turn per CSS px of finger travel. */
  lookPerPx: 0.0055,
  /** A touch that moves less than this (px) and lifts within tapMs is a tap. */
  tapSlopPx: 12,
  tapMs: 350,
  /** A fingertip covers more than a pixel: a touch that misses every
   * control also tries points this far (px) around it. */
  fingerRadiusPx: 16,
  /** A still finger on a hold-control for this long starts holding it. */
  holdDelayMs: 220,
  /** The move stick lives in this fraction of the screen's width, from the left. */
  stickZone: 0.42,
} as const;

/** Stick output for a finger dragged (dx, dy) px from where it touched down.
 * x = strafe right, y = forward (screen up), magnitude 0..1 after the dead
 * zone; knob = where to draw the knob (clamped to the travel). */
export function stickVector(dx: number, dy: number, radius: number = TOUCH.stickRadius, dead: number = TOUCH.deadZone) {
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0, knobX: 0, knobY: 0 };
  const travel = Math.min(d, radius);
  const ux = dx / d;
  const uy = dy / d;
  const m = travel / radius;
  if (m <= dead) return { x: 0, y: 0, knobX: ux * travel, knobY: uy * travel };
  const out = (m - dead) / (1 - dead);
  return { x: ux * out, y: -uy * out, knobX: ux * travel, knobY: uy * travel };
}

/** Screen points a fingertip at (x, y) covers: the centre first, then a
 * ring of eight at `r` px, so the nearest control wins over a further one. */
export function fingerPoints(x: number, y: number, r: number = TOUCH.fingerRadiusPx): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  for (let i = 0; i < 8; i++) pts.push([x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * r]);
  return pts;
}

/** True if a touch that moved `movedPx` and lasted `ms` counts as a tap. */
export function isTap(movedPx: number, ms: number): boolean {
  return movedPx < TOUCH.tapSlopPx && ms <= TOUCH.tapMs;
}

/** Rewrites a control's prompt for touch players: the stations say "E to …"
 * and "HOLD E"; on a touchscreen the key is the USE button (or the control). */
export function touchPrompt(prompt: string): string {
  return prompt.replace(/\bHOLD E\b/g, "HOLD USE").replace(/(?<![\w'])E to\b/g, "USE to");
}

/** Follows the device the player is actually using: a coarse primary pointer
 * starts in touch mode, and every pointerdown says which kind it was, so a
 * touchscreen laptop switches as soon as the player reaches for the mouse.
 * Call once at startup. */
export function watchInputKind(): void {
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") setTouch(true);
      else if (e.pointerType === "mouse") setTouch(false);
    },
    { capture: true, passive: true },
  );
}

function setTouch(touch: boolean): void {
  const s = useStore.getState();
  if (s.touch === touch) return;
  // leaving touch mode while "on the controls" without pointer lock: show the
  // briefing card so the mouse player can click in (and lock) properly
  if (!touch && s.locked && !document.pointerLockElement) useStore.setState({ touch, locked: false });
  else useStore.setState({ touch });
}

/** Vertical field of view that keeps a portrait screen from becoming a
 * keyhole: below square, widen the vertical angle so the horizontal one
 * stays what a square view of `fov` would show, up to `max` degrees. */
export function fitFov(fov: number, aspect: number, max = 100): number {
  if (!(aspect > 0) || aspect >= 1) return fov;
  const half = (fov * Math.PI) / 360;
  return Math.min(max, (Math.atan(Math.tan(half) / aspect) * 360) / Math.PI);
}
