// Every tunable number in the game. Rules that use them: docs/PUZZLES.md.

export const TICK_MS = 200;
export const VIEW_PUSH_MS = 200;
export const PERSIST_EVERY_MS = 2000;
/** A tick never advances the simulation more than this, so a server pause
 * or restart reads as a pause, not a flood. */
export const MAX_TICK_DT_S = 1;
export const DISCONNECT_PAUSE_MS = 3000;
export const ABANDON_AFTER_MS = 6 * 60 * 60 * 1000;

export const CALLSIGN_MAX = 12;

export const DANGER = {
  start: 10,
  max: 100,
  criticalAt: 75,
  stableRate: 0.05,
  rate: {
    PROLOGUE: 0,
    POWER: 0.06,
    FLOOD_BASE: 0.03,
    FLOOD_PER_LEVEL: 0.1,
    RADIO: 0.08,
    ESCAPE: 0.3,
  },
} as const;

export const POWER = {
  breakers: 6,
  tripMs: 6000,
  dangerShort: 4,
  dangerOverload: 3,
  dangerRelief: 5,
} as const;

export const FLOOD = {
  maxPumps: 2,
  drainRate: 4.2,
  backflowRate: 3,
  inflowMin: 0.15,
  inflowMax: 0.3,
  startMin: 55,
  startMax: 75,
  pressureRise: 18,
  pressureRelax: 30,
  burstAt: 100,
  dangerBurst: 3,
  targetLevel: 20,
  dangerRelief: 20,
} as const;

export const RADIO = {
  channels: 24,
  resonanceMin: 4,
  resonanceMax: 19,
  stations: 5,
  dangerArc: 2,
  dangerWrongStation: 3,
  dangerNoCarrier: 1,
  dangerRelief: 5,
  /** MHz shown for channel 0 and step per channel */
  mhzBase: 2.0,
  mhzStep: 0.25,
} as const;

export const ESCAPE = {
  bandWidth: 20,
  bandMins: [40, 50, 60],
  stroke: 9,
  strokeMinGapMs: 180,
  decayIdle: 1.5,
  decayDoor: 4,
  ventAt: 95,
  ventTo: 30,
  doorRate: 10,
  /** door %/s lost while held above the band (rams slip) */
  slipRate: 15,
  abandonWindowMs: 3000,
} as const;
