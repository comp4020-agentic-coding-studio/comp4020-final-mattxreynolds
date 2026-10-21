// The interactable id contract. Rooms must register controls under exactly
// these ids (the browser specs drive them through window.__btw.use).

import type { Compartment } from "../../shared/glyphs.ts";
import type { Circuit } from "../../shared/protocol.ts";

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
  /** Aux Machinery Room: generator RESET (gridReset) */
  gridReset: "grid-reset",

  // Bridge (Navigator)
  prologueAck: "prologue-ack",
  pump: (i: number) => `pump-${i}`,
  tuneDown: "tune-down",
  tuneUp: "tune-up",
  transmit: "transmit",
  /** hold control: onHold(true/false) → holdDoor */
  doorRelease: "door-release",
  abandonNavigator: "abandon-navigator",
  /** Comms Room: distribution panel circuit switches (setCircuit) */
  circuit: (c: Circuit) => `circuit-${c}`,
  /** Comms Room: answer the calling coast station (answerCall) */
  answerCall: "answer-call",
  /** Comms Room: arm the lifeboat davits (armDavits) */
  armDavits: "arm-davits",
} as const;
