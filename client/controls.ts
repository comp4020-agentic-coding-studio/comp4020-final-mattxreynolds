// Pure input maths for touch and portrait play (#51, #17), and the per-browser
// Controls setting. "direct" is keys/stick and drag-to-look; "tap" is
// point-and-click (desktop) or tap-to-walk (touch).
export type ControlsMode = "direct" | "tap";
export interface Walk { forward: number; right: number }

const KEY = "controls";
const DEAD_ZONE = 0.1;
const ARRIVED = 0.15; // metres

type Store = Pick<Storage, "getItem" | "setItem">;

/** A stick offset in pixels (dx right, dy down) over its radius, as a walk of magnitude 0..1. */
export function stickVector(dx: number, dy: number, radius: number): Walk {
  const len = Math.hypot(dx, dy) / radius;
  if (len < DEAD_ZONE) return { forward: 0, right: 0 };
  const norm = Math.max(len, 1); // beyond the rim, the direction is kept and the speed is full
  return { forward: -dy / radius / norm || 0, right: dx / radius / norm || 0 };
}

export function controlsMode(storage: Store): ControlsMode {
  try {
    return storage.getItem(KEY) === "tap" ? "tap" : "direct";
  } catch {
    return "direct";
  }
}

export function saveControlsMode(storage: Store, mode: ControlsMode): void {
  try {
    storage.setItem(KEY, mode);
  } catch {
    // private mode: the setting lasts until the reload
  }
}

/** The walk (in the player's own frame) towards a floor point, or null once there. Yaw 0 looks north (-z). */
export function walkTowards(from: { x: number; z: number }, yaw: number, to: { x: number; z: number }): Walk | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVED) return null;
  const ux = dx / dist;
  const uz = dz / dist;
  return { forward: -Math.sin(yaw) * ux - Math.cos(yaw) * uz, right: Math.cos(yaw) * ux - Math.sin(yaw) * uz };
}
