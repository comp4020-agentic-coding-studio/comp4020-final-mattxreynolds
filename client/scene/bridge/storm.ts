// Shared storm state: written once per frame by <StormDriver> (Exterior.tsx),
// read by the sky/sea/rain shaders and the room lights.

import { ACT_OF } from "../../../shared/protocol.ts";
import { navView } from "./state.ts";

export const storm = {
  /** 0..1 how rough it is (act + danger) */
  level: 0.4,
  /** 0..1 lightning flash envelope (0 under reduced motion) */
  flash: 0,
  /** ship pitch / roll in radians (0 under reduced motion) */
  pitch: 0,
  roll: 0,
};

export function stormTarget(): number {
  const v = navView();
  if (!v) return 0.4;
  const act = ACT_OF[v.phase] || 3;
  return Math.min(1, 0.3 + act * 0.1 + (v.danger / 100) * 0.3);
}
