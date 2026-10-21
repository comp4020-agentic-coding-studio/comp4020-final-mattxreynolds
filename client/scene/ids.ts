// The interactable id contract. Rooms must register controls under exactly
// these ids (the browser specs drive them through window.__btw.use).

import type { Compartment } from "../../shared/glyphs.ts";

export const IDS = {
  // Engine Room (Engineer)
  prologueLever: "prologue-lever",
  breaker: (i: number) => `breaker-${i}`,
  valve: (c: Compartment) => `valve-${c}`,
  coupleLever: "couple-lever",
  /** rotate the antenna one compass point anticlockwise / clockwise */
  antennaLeft: "antenna-left",
  antennaRight: "antenna-right",
  handPump: "hand-pump",
  abandonEngineer: "abandon-engineer",

  // Bridge (Navigator)
  prologueAck: "prologue-ack",
  pump: (i: number) => `pump-${i}`,
  tuneDown: "tune-down",
  tuneUp: "tune-up",
  transmit: "transmit",
  /** hold control: onHold(true/false) → holdDoor */
  doorRelease: "door-release",
  abandonNavigator: "abandon-navigator",
} as const;
