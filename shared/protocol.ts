// The wire contract between client and server. Server→client data is always a
// role-specific View (server/game/views.ts decides what each role may see).

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

export const PHASES = ["LOBBY", "PROLOGUE", "POWER", "FLOOD", "RADIO", "ESCAPE", "SURVIVED", "LOST"] as const;
export type Phase = (typeof PHASES)[number];
export const PLAY_PHASES: readonly Phase[] = ["PROLOGUE", "POWER", "FLOOD", "RADIO", "ESCAPE"];
export const isPlaying = (p: Phase): boolean => PLAY_PHASES.includes(p);
export const isEnded = (p: Phase): boolean => p === "SURVIVED" || p === "LOST";

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
  | { t: "sailAgain" };

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
  | "paused";

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
  | { k: "burst"; compartment: Compartment }
  | { k: "floodStable" }
  | { k: "arc" }
  | { k: "coupled" }
  | { k: "reply"; result: "contact" | "wrong-station" | "no-carrier" }
  | { k: "vent" }
  | { k: "doorOpen" }
  | { k: "abandonPulled"; role: Role }
  | { k: "phase"; phase: Phase }
  | { k: "rejected"; reason: RejectReason };

// ---------------------------------------------------------------- views

export type CrewView = { role: Role; callsign: string; connected: boolean; ready: boolean };

export type FloodTrend = "STABLE" | "RISING" | "CRITICAL";

export type Outcome = {
  result: "SURVIVED" | "LOST";
  failureCause: string | null;
  phaseReached: Phase;
  durationMs: number;
  mistakes: number;
  nextCode: string | null;
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
};

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
};

export type View = EngineerView | NavigatorView;

/** Which role may send each intent, and in which phases. */
export const INTENT_RULES: Record<IntentType, { roles: readonly Role[]; phases: readonly Phase[] }> = {
  setReady: { roles: ROLES, phases: ["LOBBY"] },
  prologueBreaker: { roles: ["ENGINEER"], phases: ["PROLOGUE"] },
  prologueAck: { roles: ["NAVIGATOR"], phases: ["PROLOGUE"] },
  setBreaker: { roles: ["ENGINEER"], phases: ["POWER"] },
  setValve: { roles: ["ENGINEER"], phases: ["FLOOD"] },
  setPump: { roles: ["NAVIGATOR"], phases: ["FLOOD"] },
  tune: { roles: ["NAVIGATOR"], phases: ["RADIO"] },
  couple: { roles: ["ENGINEER"], phases: ["RADIO"] },
  setAntenna: { roles: ["ENGINEER"], phases: ["RADIO"] },
  transmit: { roles: ["NAVIGATOR"], phases: ["RADIO"] },
  pumpStroke: { roles: ["ENGINEER"], phases: ["ESCAPE"] },
  holdDoor: { roles: ["NAVIGATOR"], phases: ["ESCAPE"] },
  abandon: { roles: ROLES, phases: ["ESCAPE"] },
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
  ESCAPE: {
    ENGINEER: "Pressurise the door rams, then abandon ship together",
    NAVIGATOR: "Release the door in the pressure band, then abandon ship together",
  },
  SURVIVED: { ENGINEER: "You made it off", NAVIGATOR: "You made it off" },
  LOST: { ENGINEER: "The ship went down", NAVIGATOR: "The ship went down" },
};
