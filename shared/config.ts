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
    FLOOD: 0.03,
    RADIO: 0.07,
    CASCADE: 0.08,
    ESCAPE: 0.3,
    /** + this × (mean compartment level / 100) in every act with live water */
    PER_LEVEL: 0.1,
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
  /** a compartment at or below this is "dry"; a pump drawing on it for
   * dryRunS seconds seizes. Only the Bridge's map shows the level, so the
   * Engineer must be told when to shut a valve (blind-play fix). */
  dryAt: 6,
  dryRunS: 1.5,
  /** a seized pump can't be restarted for this long */
  seizeMs: 12000,
  /** every compartment must stay at or below targetLevel this long */
  holdS: 6,
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

// ------------------------------------------------------------ ship systems
// The continuous ship simulation (server/game/ship.ts, docs/SYSTEMS.md). It
// runs from the moment emergency power is online until the voyage ends.

export const GRID = {
  /** generator output with a healthy machine */
  baseCapacity: 10,
  /** capacity lost per Act I breaker trip (the generator is worn), at most maxPowerWear */
  wearPerPowerTrip: 1,
  maxPowerWear: 2,
  /** capacity lost per grid trip later on */
  wearPerGridTrip: 1,
  /** the generator never derates below this, so every act stays solvable */
  minCapacity: 6,
  load: { pump: 2, radioIdle: 1, radioActive: 3, lights: 1, evacCharging: 4, evacHolding: 1, davits: 3 },
  /** heat %/s per unit of overload, and cooling %/s when within capacity */
  heatPerOverload: 9,
  coolRate: 12,
  /** heat after a trip resets (a hot machine trips again sooner) */
  heatAfterTrip: 55,
  tripMs: 6000,
  dangerTrip: 3,
} as const;

export const HULL = {
  /** once flood control holds, damage control shores the hull: base inflow × this */
  shored: 0.35,
  /** each Act II relief-valve burst cracks that compartment's seam: +inflow %/s for the rest of the voyage */
  seamLeak: 0.08,
  /** a compartment that reaches 100 is lost: one-off danger and it stays full */
  dangerLost: 10,
  /** CHAIN_REACTION: a lost compartment leaks this %/s into each neighbour */
  chainLeak: 0.25,
} as const;

export const CASCADE = {
  /** evac accumulator %/s while the EVAC circuit is live */
  chargeRate: 1.25,
  /** charge lost when the generator trips mid-charge */
  chargeLostOnTrip: 15,
  breaches: 3,
  /** seconds into the act of the first breach, then spacing (± jitter) */
  firstBreachS: 8,
  breachSpacingS: 26,
  breachJitterS: 5,
  /** %/s added permanently to the breached compartment's inflow */
  breachRateMin: 0.6,
  breachRateMax: 0.85,
  /** coast-station calls: when they ring (s into the act) and how long */
  calls: 2,
  firstCallS: 20,
  callSpacingS: 38,
  callWindowS: 20,
  dangerRelief: 10,
} as const;

export const FINALE = {
  /** extra inflow %/s in every compartment once the ship is abandoned */
  inflow: 0.2,
  /** each answered coast-station call cuts the escape danger rate by this fraction */
  callBonus: 0.12,
  /** charge %/s lost in the escape when the EVAC circuit isn't live */
  evacDecay: 1.5,
  /** the davits arm only with at least this much accumulator charge */
  armCharge: 50,
} as const;

/** The compartment fire (Acts III-V): docs/SYSTEMS.md, docs/adr/006. */
export const INCIDENT = {
  /** isolator switches on the Engineer's fire panel, and how many a procedure throws */
  isolators: 5,
  steps: 4,
  /** fire classes: each has its own symptom glyph and its own procedure */
  kinds: 3,
  /** ignition: seconds after the act begins (seeded in this range) */
  atMinS: 30,
  atMaxS: 60,
  startIntensity: 15,
  /** intensity %/s while burning; flashover at 100 */
  growPerS: 1.2,
  /** a wrong move flares the fire, resets the panel and locks it */
  flare: 40,
  lockMs: 8000,
  /** the burning compartment takes on this much extra water, %/s, while it burns (a fire main bursts) */
  leak: 0.12,
  /** danger %/s at full intensity while it burns */
  dangerPerS: 0.08,
  dangerFlare: 2,
  dangerBurnout: 6,
  dangerRelief: 4,
  /** from this intensity the burning plant derates the generator */
  derateAt: 50,
  derate: 1,
} as const;

/** How often the debrief timeline samples the ship (simulated ms). */
export const SAMPLE_EVERY_MS = 5000;
export const MAX_SAMPLES = 480;
export const MAX_LOG = 400;

// ------------------------------------------------------------ modes

export const MODES = ["STANDARD", "ROUGH_SEAS", "BLACKOUT", "RAPID_FLOOD", "CHAIN_REACTION", "NIGHTMARE"] as const;
export type Mode = (typeof MODES)[number];

export type ModeRules = {
  title: string;
  blurb: string;
  inflow: number;
  drain: number;
  breach: number;
  heat: number;
  capacity: number;
  danger: number;
  doorDecay: number;
  /** grid trips also burst a running pump; lost compartments leak into neighbours */
  chain: boolean;
  /** lights start shed and every console runs on emergency lighting */
  dark: boolean;
  /** cosmetic: how hard the ship rolls */
  sway: number;
};

const BASE: ModeRules = {
  title: "Standard Voyage",
  blurb: "The canonical disaster.",
  inflow: 1,
  drain: 1,
  breach: 1,
  heat: 1,
  capacity: 0,
  danger: 1,
  doorDecay: 1,
  chain: false,
  dark: false,
  sway: 1,
};

export const MODE_RULES: Record<Mode, ModeRules> = {
  STANDARD: BASE,
  ROUGH_SEAS: {
    ...BASE,
    title: "Rough Seas",
    blurb: "Heavy weather: the ship rolls hard, the generator runs hot and the door rams bleed pressure faster.",
    heat: 1.3,
    doorDecay: 1.4,
    inflow: 1.15,
    sway: 2.6,
  },
  BLACKOUT: {
    ...BASE,
    title: "Blackout",
    blurb: "A weaker generator. Every unit of load is a decision, and the rooms run on emergency lamps.",
    capacity: -2,
    dark: true,
  },
  RAPID_FLOOD: {
    ...BASE,
    title: "Rapid Flood",
    blurb: "The sea comes in much faster. The pumps are stronger to match, so every second of a wrong valve costs more.",
    inflow: 1.8,
    breach: 1.5,
    drain: 1.3,
  },
  CHAIN_REACTION: {
    ...BASE,
    title: "Chain Reaction",
    blurb: "Failures spread: a generator trip bursts a running pump, and a lost compartment leaks into its neighbours.",
    heat: 1.5,
    chain: true,
  },
  NIGHTMARE: {
    ...BASE,
    title: "All Systems",
    blurb: "Everything at once, slightly softened so it stays fair.",
    inflow: 1.4,
    breach: 1.25,
    drain: 1.2,
    heat: 1.3,
    capacity: -1,
    doorDecay: 1.25,
    chain: true,
    dark: true,
    sway: 2,
  },
};

/** Surviving these many distinct challenge modes unlocks NIGHTMARE. */
export const NIGHTMARE_AFTER = 2;
