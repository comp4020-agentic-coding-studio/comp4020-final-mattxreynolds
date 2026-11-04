// The wire contract between client and server. Server→client data is always a
// role-specific View (server/game/views.ts decides what each role may see).

import type { Mode } from "./config.ts";
import type { Bearing, Compartment, Glyph, Pulse, ShipSystem } from "./glyphs.ts";

export const ROLES = ["ENGINEER", "NAVIGATOR"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_TITLE: Record<Role, string> = {
  ENGINEER: "Engineer",
  NAVIGATOR: "Radio Officer / Navigator",
};
export const ROLE_ROOM: Record<Role, string> = {
  ENGINEER: "Engine Room",
  NAVIGATOR: "Bridge",
};

export const PHASES = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE", "SURVIVED", "LOST"] as const;
export type Phase = (typeof PHASES)[number];
export const PLAY_PHASES: readonly Phase[] = ["PROLOGUE", "POWER", "FLOOD", "RADIO", "CASCADE", "ESCAPE"];
/** Phases in which the ship's systems (grid, water, hull) are live. */
export const SHIP_PHASES: readonly Phase[] = ["FLOOD", "RADIO", "CASCADE", "ESCAPE"];
export const isPlaying = (p: Phase): boolean => PLAY_PHASES.includes(p);
export const isEnded = (p: Phase): boolean => p === "SURVIVED" || p === "LOST";
export const phaseIndex = (p: Phase): number => PHASES.indexOf(p);

/** The voyage is one continuous disaster told in five acts. */
export type Act = 1 | 2 | 3 | 4 | 5;
export const ACT_OF: Record<Phase, Act | 0> = {
  LOBBY: 0,
  PROLOGUE: 1,
  POWER: 1,
  FLOOD: 2,
  RADIO: 3,
  CASCADE: 4,
  ESCAPE: 5,
  SURVIVED: 0,
  LOST: 0,
};
export const ACT_TITLE: Record<Act, string> = {
  1: "Impact",
  2: "Stabilisation",
  3: "Mayday",
  4: "Cascade",
  5: "Abandon Ship",
};
/** The first phase of each act: where a practice run starts. */
export const ACT_START: Record<Act, Phase> = { 1: "PROLOGUE", 2: "FLOOD", 3: "RADIO", 4: "CASCADE", 5: "ESCAPE" };

/** Rooms beyond the two starting rooms open as the disaster unfolds: the
 * Engineer's Auxiliary Machinery Room (generator plant) when emergency power
 * is online, the Bridge's Comms Room (distribution panel, accumulator,
 * davits) when the distress phase begins. */
export const ROOM_UNLOCK = { AUX: "FLOOD", COMMS: "RADIO" } as const satisfies Record<string, Phase>;
export const roomOpen = (room: keyof typeof ROOM_UNLOCK, phase: Phase, reached?: Phase): boolean => {
  const p = phase === "LOST" || phase === "SURVIVED" ? (reached ?? phase) : phase;
  return phase === "SURVIVED" || phaseIndex(p) >= phaseIndex(ROOM_UNLOCK[room]);
};

export const CIRCUITS = ["LIGHTS", "RADIO", "EVAC"] as const;
export type Circuit = (typeof CIRCUITS)[number];
export const CIRCUIT_LABEL: Record<Circuit, string> = {
  LIGHTS: "ENGINE RM LIGHTING",
  RADIO: "W/T RADIO",
  EVAC: "EVAC ACCUMULATOR",
};

// ---------------------------------------------------------------- intents

export type Intent =
  | { t: "setReady"; ready: boolean }
  | { t: "prologueBreaker" }
  | { t: "prologueAck" }
  | { t: "setBreaker"; index: number; closed: boolean }
  | { t: "setValve"; compartment: Compartment; open: boolean }
  | { t: "setPump"; pump: number; on: boolean }
  | { t: "tune"; channel: number }
  | { t: "couple" }
  | { t: "setAntenna"; bearing: number }
  | { t: "transmit" }
  | { t: "pumpStroke" }
  | { t: "holdDoor"; held: boolean }
  | { t: "abandon" }
  | { t: "setCircuit"; circuit: Circuit; on: boolean }
  | { t: "gridReset" }
  | { t: "setIsolator"; index: number; on: boolean }
  | { t: "answerCall" }
  | { t: "armDavits" }
  | { t: "setMode"; mode: Mode }
  | { t: "setStart"; act: Act }
  | { t: "sailAgain"; sameShip?: boolean };

export type IntentType = Intent["t"];

export type RejectReason =
  | "not-seated"
  | "wrong-phase"
  | "wrong-role"
  | "bad-input"
  | "not-ready-to-start"
  | "consoles-dead"
  | "generator-tripped"
  | "pump-bus-limit"
  | "carrier-locked"
  | "not-coupled"
  | "door-not-open"
  | "too-fast"
  | "panel-locked"
  | "paused"
  | "pump-seized"
  | "grid-down"
  | "radio-unpowered"
  | "evac-offline"
  | "evac-low"
  | "no-call"
  | "davits-not-armed"
  | "locked";

export type IntentMessage = { seq: number; intent: Intent };
export type IntentAck = { ok: true; rev: number } | { ok: false; reason: RejectReason; rev: number };

export type HelloMessage = { code: string; token: string };
export type HelloAck = { ok: true } | { ok: false; reason: "not-found" | "bad-token" };

// ---------------------------------------------------------------- fx

/** One-shot effects so clients can play sounds/animations at the right moment. */
export type Fx =
  | { k: "busOn" }
  | { k: "ack" }
  | { k: "trip"; cause: "short" | "overload" | "backfeed" }
  | { k: "powerOnline" }
  | { k: "burst"; compartment: Compartment; dry?: boolean }
  | { k: "floodStable" }
  | { k: "arc" }
  | { k: "coupled" }
  | { k: "reply"; result: "contact" | "wrong-station" | "no-carrier" }
  | { k: "vent" }
  | { k: "doorOpen" }
  | { k: "abandonPulled"; role: Role }
  | { k: "gridTrip" }
  | { k: "gridReset" }
  | { k: "overheat" }
  | { k: "breach"; compartment: Compartment }
  | { k: "compartmentLost"; compartment: Compartment }
  | { k: "call" }
  | { k: "fire"; ev: "ignite" | "step" | "flare" | "out" | "burnout" }
  | { k: "callResult"; answered: boolean }
  | { k: "evacCharged" }
  | { k: "davitsArmed"; armed: boolean }
  | { k: "phase"; phase: Phase }
  | { k: "rejected"; reason: RejectReason };

// ---------------------------------------------------------------- views

export type CrewView = { role: Role; callsign: string; connected: boolean; ready: boolean };

export type FloodTrend = "STABLE" | "RISING" | "CRITICAL";

export type DebriefEvent = { seq: number; t: number; actor: Role | "SHIP"; k: string; text: string; tone: "good" | "bad" | "info" };
export type DebriefSample = { t: number; danger: number; water: [number, number, number]; heat: number; evac: number };
export type Highlight = { label: string; value: string; detail: string; tone: "good" | "bad" | "info" };
export type Debrief = {
  /** the voyage's seed as a shareable label; only exists once it has ended */
  shipNo: string;
  mode: Mode;
  practice: Act | null;
  result: "SURVIVED" | "LOST";
  durationMs: number;
  events: DebriefEvent[];
  samples: DebriefSample[];
  highlights: Highlight[];
  /** Plain-language lessons: why the run went the way it did. */
  lessons: string[];
  actTimes: Partial<Record<Act, number>>;
};

export type Outcome = {
  result: "SURVIVED" | "LOST";
  failureCause: string | null;
  phaseReached: Phase;
  durationMs: number;
  mistakes: number;
  nextCode: string | null;
  debrief: Debrief | null;
};

export type LobbySettings = {
  mode: Mode;
  /** null = full voyage from Act I; otherwise a practice run from that act */
  practice: Act | null;
  unlockedModes: Mode[];
  /** highest act this ship's crews have reached on a full voyage */
  unlockedActs: Act;
};

/** Ship state both seats may see: it carries no puzzle answers. */
export type ShipCommon = {
  /** generator tripped: the grid is dead until the Engineer resets it */
  gridDown: boolean;
  circuits: Record<Circuit, boolean>;
  evac: number;
  evacOnline: boolean;
  armed: boolean;
  lost: Record<Compartment, boolean>;
  callsAnswered: number;
  callsMissed: number;
  /** a coast station is calling (the bearing is the Bridge's alone) */
  calling: boolean;
};

export type CommonView = {
  rev: number;
  code: string;
  you: Role;
  phase: Phase;
  crew: CrewView[];
  danger: number;
  trend: FloodTrend;
  paused: boolean;
  elapsedMs: number;
  outcome: Outcome | null;
  prologue: { busOn: boolean; acknowledged: boolean };
  act: Act | 0;
  mode: Mode;
  practice: Act | null;
  lobby: LobbySettings | null;
  ship: ShipCommon;
};

/** The compartment fire (docs/SYSTEMS.md): each seat holds half of it. */
export type FireState = "idle" | "burning" | "out" | "burnt";

export type EngineerView = CommonView & {
  you: "ENGINEER";
  power: {
    breakers: { glyph: Glyph; load: number; closed: boolean }[];
    load: number;
    tripped: boolean;
    online: boolean;
  };
  flood: {
    valves: Record<Compartment, { open: boolean; pressure: number }>;
    engineLevel: number;
    stable: boolean;
  };
  radio: {
    resonance: number;
    lock: boolean;
    coupled: boolean;
    pulse: Pulse | null;
    antenna: number;
    contact: boolean;
  };
  escape: {
    pressure: number;
    door: number;
    youAbandon: boolean;
    partnerAbandon: boolean;
  };
  /** The generator plant (Aux Machinery Room): only the Engineer reads it. */
  grid: {
    load: number;
    /** what the generator can deliver now (wear lowers it) */
    output: number;
    /** 0–100; trips at 100 */
    heat: number;
    tripped: boolean;
    /** the trip cooldown has passed and RESET will take */
    resetReady: boolean;
    wear: number;
  };
  /** Fire panel: the Engineer sees the symptom (class glyph, smoke) and the
   * isolators; never where it burns or which order to throw them. */
  fire: {
    state: FireState;
    /** 0-100: how much smoke */
    smoke: number;
    /** the glyph on the smoke plate: which class of fire this is */
    symptom: Glyph | null;
    isolators: { glyph: Glyph; thrown: boolean }[];
    /** a wrong throw reset the panel; it is locked for a few seconds */
    locked: boolean;
  };
};

export type NavigatorView = CommonView & {
  you: "NAVIGATOR";
  power: {
    diagram: { system: ShipSystem; feeders: [Glyph, Glyph] }[];
    shorted: Glyph;
    /** Generator rating: the Bridge's, so the Engineer's load meter alone can't solve it. */
    capacity: number;
    fed: Record<ShipSystem, boolean>;
    tripped: boolean;
    online: boolean;
  };
  flood: {
    levels: Record<Compartment, number>;
    trends: Record<Compartment, -1 | 0 | 1>;
    /** a pump is drawing on this empty compartment and will seize */
    dry: Record<Compartment, boolean>;
    /** seconds all three have been held below the line (of FLOOD.holdS) */
    held: number;
    pumps: { glyph: Glyph; on: boolean }[];
    stable: boolean;
  };
  radio: {
    channel: number;
    coupled: boolean;
    stations: { glyph: Glyph; pattern: Pulse; bearing: Bearing }[];
    signal: number;
    contact: boolean;
    lastReply: "contact" | "wrong-station" | "no-carrier" | null;
  };
  escape: {
    band: [number, number];
    status: "LOW" | "OK" | "HIGH";
    door: number;
    held: boolean;
    youAbandon: boolean;
    partnerAbandon: boolean;
  };
  /** Distribution panel: what each circuit draws (not the generator's rating). */
  dist: {
    draw: Record<Circuit | "PUMPS" | "DAVITS", number>;
  };
  hull: {
    breached: Record<Compartment, boolean>;
  };
  /** Coast-station call (Comms Room): the bearing to aim the antenna at. */
  call: { bearing: Bearing; remainingS: number } | null;
  /** Damage-control fire card (Comms Room): where it burns and the procedure
   * book. The book says which isolators to throw, in order, for each class
   * glyph; which class is burning is the Engineer's to read. */
  fire: {
    state: FireState;
    compartment: Compartment | null;
    intensity: number;
    done: number;
    steps: number;
    locked: boolean;
    book: { kind: Glyph; sequence: Glyph[] }[];
  };
};

export type View = EngineerView | NavigatorView;

/** Which role may send each intent, and in which phases. */
export const INTENT_RULES: Record<IntentType, { roles: readonly Role[]; phases: readonly Phase[] }> = {
  setReady: { roles: ROLES, phases: ["LOBBY"] },
  prologueBreaker: { roles: ["ENGINEER"], phases: ["PROLOGUE"] },
  prologueAck: { roles: ["NAVIGATOR"], phases: ["PROLOGUE"] },
  setBreaker: { roles: ["ENGINEER"], phases: ["POWER"] },
  setValve: { roles: ["ENGINEER"], phases: SHIP_PHASES },
  setPump: { roles: ["NAVIGATOR"], phases: SHIP_PHASES },
  tune: { roles: ["NAVIGATOR"], phases: ["RADIO"] },
  couple: { roles: ["ENGINEER"], phases: ["RADIO"] },
  setAntenna: { roles: ["ENGINEER"], phases: ["RADIO", "CASCADE"] },
  transmit: { roles: ["NAVIGATOR"], phases: ["RADIO"] },
  pumpStroke: { roles: ["ENGINEER"], phases: ["ESCAPE"] },
  holdDoor: { roles: ["NAVIGATOR"], phases: ["ESCAPE"] },
  abandon: { roles: ROLES, phases: ["ESCAPE"] },
  setCircuit: { roles: ["NAVIGATOR"], phases: ["RADIO", "CASCADE", "ESCAPE"] },
  gridReset: { roles: ["ENGINEER"], phases: SHIP_PHASES },
  setIsolator: { roles: ["ENGINEER"], phases: ["RADIO", "CASCADE", "ESCAPE"] },
  answerCall: { roles: ["NAVIGATOR"], phases: ["CASCADE"] },
  armDavits: { roles: ["NAVIGATOR"], phases: ["ESCAPE"] },
  setMode: { roles: ROLES, phases: ["LOBBY"] },
  setStart: { roles: ROLES, phases: ["LOBBY"] },
  sailAgain: { roles: ROLES, phases: ["SURVIVED", "LOST"] },
};

export const PHASE_OBJECTIVE: Record<Phase, Record<Role, string>> = {
  LOBBY: { ENGINEER: "Waiting for crew", NAVIGATOR: "Waiting for crew" },
  PROLOGUE: {
    ENGINEER: "Restore the emergency bus",
    NAVIGATOR: "Get the consoles back, then acknowledge the alarm",
  },
  POWER: {
    ENGINEER: "Bring the generator online — feed pumps, radio and helm",
    NAVIGATOR: "Read the routing diagram — guide the Engineer's breakers",
  },
  FLOOD: {
    ENGINEER: "Route the pumps — open the right suction valves",
    NAVIGATOR: "Run the pumps — bring every compartment below 20%",
  },
  RADIO: {
    ENGINEER: "Couple the transmitter, then aim the antenna",
    NAVIGATOR: "Tune the carrier, identify the station, transmit",
  },
  CASCADE: {
    ENGINEER: "Keep the generator alive and the right valves open while the accumulator charges",
    NAVIGATOR: "Charge the evac accumulator — shed load, chase the breaches, answer the coast station",
  },
  ESCAPE: {
    ENGINEER: "Pressurise the door rams, keep the grid up, then abandon ship together",
    NAVIGATOR: "Arm the davits, release the door in the pressure band, then abandon ship together",
  },
  SURVIVED: { ENGINEER: "You made it off", NAVIGATOR: "You made it off" },
  LOST: { ENGINEER: "The ship went down", NAVIGATOR: "The ship went down" },
};
