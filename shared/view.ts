// The API contract between server and client: what a room looks like from
// each seat, the actions a player can take, and the station log's rows.
import type {
  CasingColor,
  LightColor,
  ModuleId,
  OverrideLabel,
  WireColor,
} from "./game.ts";

export type Role = "operator" | "expert";
export type Status = "ready" | "live" | "over";
export type Outcome = "defused" | "exploded" | "timeout";

export interface LogEntry {
  at: number;
  text: string;
  tone: "info" | "good" | "bad";
}

export interface CrewMember {
  tag: string;
  callsign: string;
  role: Role;
}

/** The device as the Operator sees it. The Expert's view never carries one. */
export interface OperatorDevice {
  serial: string;
  wires: { color: WireColor; cut: boolean }[];
  symbols: { glyph: string; step: number | null }[]; // step: when it was pressed in the sequence
  keypad: { stage: number; display: number | null; keys: number[] };
  switches: { lights: LightColor[]; up: boolean[] };
  override: { casing: CasingColor; label: OverrideLabel };
}

export interface RoomView {
  code: string;
  role: Role;
  missionNo: number;
  status: Status;
  outcome: Outcome | null;
  serverNow: number;
  endsAt: number | null;
  msLeft: number;
  strikes: number;
  solved: Record<ModuleId, boolean>;
  log: LogEntry[];
  crew: CrewMember[];
  device?: OperatorDevice;
}

export type Action =
  | { type: "start" }
  | { type: "cut"; wire: number }
  | { type: "symbol"; index: number }
  | { type: "key"; position: number }
  | { type: "flip"; index: number }
  | { type: "engage" }
  | { type: "override" }
  | { type: "newMission" };

export interface LogRow {
  id: number;
  roomCode: string;
  missionNo: number;
  outcome: Outcome;
  modulesCleared: number;
  strikes: number;
  msLeft: number;
  crew: { tag: string; callsign: string }[];
  endedAt: number;
  mine: boolean;
}

export interface StationLog {
  totals: { missions: number; defused: number };
  you: { missions: number; defused: number } | null;
  runs: LogRow[];
}
