import type { Response } from "express";
import { Router } from "express";
import * as G from "../shared/game.ts";
import type {
  Action,
  CrewMember,
  LogEntry,
  LogRow,
  Outcome,
  Role,
  RoomView,
  StationLog,
  Status,
} from "../shared/view.ts";
import { db } from "./db.ts";
import { getPlayer, playerFrom, type Player } from "./players.ts";

// Rooms are server-authoritative: the device and every rule check live here,
// clients only send intents. Each room is cached in memory and written through
// to SQLite on every change, so a restart picks up where it left off.

interface Mission {
  no: number;
  device: G.Device;
  status: Status;
  outcome: Outcome | null;
  startedAt: number | null;
  endsAt: number | null;
  msLeftAtEnd: number | null;
  strikes: number;
  solved: Record<G.ModuleId, boolean>;
  cut: number[];
  symbolPresses: number[];
  keypadHistory: G.KeyPress[];
  switches: boolean[];
  crew: Record<string, string>; // tag -> callsign, everyone who took part
}

interface Room {
  code: string;
  createdAt: number;
  mission: Mission;
  log: LogEntry[];
}

interface Client {
  res: Response;
  player: Player;
  role: Role;
}

const LOG_KEEP = 30;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const rooms = new Map<string, Room>();
const timers = new Map<string, NodeJS.Timeout>();
const clients = new Map<string, Set<Client>>();

function newMission(no: number): Mission {
  const device = G.generateDevice();
  return {
    no,
    device,
    status: "ready",
    outcome: null,
    startedAt: null,
    endsAt: null,
    msLeftAtEnd: null,
    strikes: 0,
    solved: { wires: false, symbols: false, keypad: false, switches: false, override: false },
    cut: [],
    symbolPresses: [],
    keypadHistory: [],
    switches: [...device.switches.initial],
    crew: {},
  };
}

// ---- Storage ---------------------------------------------------------------

function load(code: string): Room | null {
  const cached = rooms.get(code);
  if (cached) return cached;
  const row = db.prepare("SELECT state FROM rooms WHERE code = ?").get(code) as
    | { state: string }
    | undefined;
  if (!row) return null;
  const room = JSON.parse(row.state) as Room;
  rooms.set(code, room);
  arm(room);
  return room;
}

function save(room: Room): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (code, state, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
  ).run(room.code, JSON.stringify(room), room.createdAt, now);
}

function createRoom(): Room {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (load(code));
  const room: Room = { code, createdAt: Date.now(), mission: newMission(1), log: [] };
  note(room, `Room ${code} opened. Mission 001 loaded.`);
  rooms.set(code, room);
  save(room);
  return room;
}

// ---- Mission lifecycle -----------------------------------------------------

function note(room: Room, text: string, tone: LogEntry["tone"] = "info"): void {
  room.log.push({ at: Date.now(), text, tone });
  if (room.log.length > LOG_KEEP) room.log.splice(0, room.log.length - LOG_KEEP);
}

function arm(room: Room): void {
  clearTimeout(timers.get(room.code));
  const m = room.mission;
  if (m.status !== "live" || m.endsAt === null) return;
  const wait = m.endsAt - Date.now();
  if (wait <= 0) {
    finish(room, "timeout");
    save(room);
    return;
  }
  timers.set(
    room.code,
    setTimeout(() => {
      if (room.mission.status !== "live") return;
      finish(room, "timeout");
      save(room);
      broadcast(room);
    }, wait),
  );
}

function enlist(room: Room, player: Player): void {
  room.mission.crew[player.tag] = player.callsign;
}

function start(room: Room, player: Player): void {
  const m = room.mission;
  if (m.status !== "ready") return;
  const now = Date.now();
  m.status = "live";
  m.startedAt = now;
  m.endsAt = now + G.MISSION_MS;
  for (const c of clients.get(room.code) ?? []) enlist(room, c.player);
  enlist(room, player);
  note(room, `${player.callsign} started the clock.`);
  arm(room);
}

function finish(room: Room, outcome: Outcome): void {
  const m = room.mission;
  m.status = "over";
  m.outcome = outcome;
  m.msLeftAtEnd = outcome === "timeout" ? 0 : Math.max(0, (m.endsAt ?? 0) - Date.now());
  clearTimeout(timers.get(room.code));
  timers.delete(room.code);
  note(
    room,
    outcome === "defused"
      ? `Device secured with ${G.formatClock(m.msLeftAtEnd)} left. Logged to the station.`
      : outcome === "timeout"
        ? "Time expired. The device went off. Logged to the station."
        : "Third strike. The device went off. Logged to the station.",
    outcome === "defused" ? "good" : "bad",
  );
  const crew = Object.entries(m.crew).map(([tag, callsign]) => ({ tag, callsign }));
  db.prepare(
    `INSERT INTO missions (room_code, mission_no, serial, outcome, modules_cleared, strikes, ms_left, crew, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    room.code,
    m.no,
    m.device.serial,
    outcome,
    Object.values(m.solved).filter(Boolean).length,
    m.strikes,
    m.msLeftAtEnd,
    JSON.stringify(crew),
    Date.now(),
  );
}

function strike(room: Room, text: string): void {
  const m = room.mission;
  m.strikes++;
  note(room, `${text} Strike ${m.strikes}.`, "bad");
  if (m.strikes >= G.MAX_STRIKES) finish(room, "exploded");
}

function clear(room: Room, module: G.ModuleId, text: string): void {
  room.mission.solved[module] = true;
  note(room, `${text} ${G.MODULE_NAMES[module]} cleared.`, "good");
}

const inRange = (n: unknown, length: number): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < length;

/** Applies one action; returns an error message if it was refused. */
function apply(room: Room, player: Player, action: Action): string | null {
  const m = room.mission;
  const d = m.device;
  const who = player.callsign;

  if (action.type === "newMission") {
    if (m.status !== "over") return "Finish the current mission first.";
    room.mission = newMission(m.no + 1);
    note(room, `${who} loaded mission ${String(m.no + 1).padStart(3, "0")}. Fresh device.`);
    return null;
  }
  if (m.status === "over") return "This mission is over. Load a new one.";
  start(room, player);
  enlist(room, player);

  switch (action.type) {
    case "start":
      return null;

    case "cut": {
      if (m.solved.wires) return "The wire array is already cleared.";
      if (!inRange(action.wire, d.wires.length) || m.cut.includes(action.wire)) return "No such wire.";
      m.cut.push(action.wire);
      if (action.wire === G.solveWires(d)) clear(room, "wires", `${who} cut wire ${action.wire + 1}.`);
      else strike(room, `${who} cut wire ${action.wire + 1}. Wrong wire.`);
      return null;
    }

    case "symbol": {
      if (m.solved.symbols) return "The symbol lock is already cleared.";
      if (!inRange(action.index, 4) || m.symbolPresses.includes(action.index)) return "No such symbol.";
      const order = G.solveSymbols(d);
      if (action.index === order[m.symbolPresses.length]) {
        m.symbolPresses.push(action.index);
        if (m.symbolPresses.length === 4) clear(room, "symbols", `${who} entered the sequence.`);
      } else {
        m.symbolPresses = [];
        strike(room, `${who} pressed a symbol out of sequence. Lock reset.`);
      }
      return null;
    }

    case "key": {
      if (m.solved.keypad) return "The keypad is already cleared.";
      if (!inRange(action.position, 4)) return "No such key.";
      const stageIndex = m.keypadHistory.length;
      const stage = d.keypad[stageIndex];
      if (action.position === G.solveKeypad(stage, stageIndex, m.keypadHistory)) {
        m.keypadHistory.push({ position: action.position, label: stage.keys[action.position] });
        if (m.keypadHistory.length === d.keypad.length) {
          clear(room, "keypad", `${who} completed stage ${d.keypad.length}.`);
        } else {
          note(room, `${who} cleared keypad stage ${stageIndex + 1}.`);
        }
      } else {
        m.keypadHistory = [];
        d.keypad = G.generateKeypad();
        strike(room, `${who} pressed the wrong key. Keypad reset to stage 1.`);
      }
      return null;
    }

    case "flip": {
      if (m.solved.switches) return "The switch panel is already cleared.";
      if (!inRange(action.index, m.switches.length)) return "No such switch.";
      m.switches[action.index] = !m.switches[action.index];
      return null;
    }

    case "engage": {
      if (m.solved.switches) return "The switch panel is already cleared.";
      const target = G.solveSwitches(d);
      if (m.switches.every((up, i) => up === target[i])) {
        clear(room, "switches", `${who} engaged the panel.`);
      } else {
        strike(room, `${who} engaged the panel. Rejected.`);
      }
      return null;
    }

    case "override": {
      const others = G.MODULES.filter((id) => id !== "override");
      if (!others.every((id) => m.solved[id])) {
        strike(room, `${who} pressed the override while it was locked.`);
        return null;
      }
      // Accept what the presser saw a moment ago, too: the countdown on their
      // screen trails the server by the time the request takes to arrive.
      const msLeft = (m.endsAt ?? 0) - Date.now();
      const ok = [0, 350, 700].some((lag) => G.overrideTimeOk(d, G.formatClock(msLeft + lag)));
      if (ok) {
        clear(room, "override", `${who} pressed the override.`);
        finish(room, "defused");
      } else {
        strike(room, `${who} pressed the override at the wrong moment.`);
      }
      return null;
    }
  }
  return "Unknown action.";
}

// ---- Views and streaming ---------------------------------------------------

function crewOf(code: string): CrewMember[] {
  const seen = new Map<string, CrewMember>();
  for (const c of clients.get(code) ?? []) {
    seen.set(`${c.player.tag}:${c.role}`, {
      tag: c.player.tag,
      callsign: c.player.callsign,
      role: c.role,
    });
  }
  return [...seen.values()];
}

function view(room: Room, role: Role): RoomView {
  const m = room.mission;
  const now = Date.now();
  const v: RoomView = {
    code: room.code,
    role,
    missionNo: m.no,
    status: m.status,
    outcome: m.outcome,
    serverNow: now,
    endsAt: m.endsAt,
    msLeft:
      m.status === "ready" ? G.MISSION_MS : m.status === "live" ? (m.endsAt ?? now) - now : (m.msLeftAtEnd ?? 0),
    strikes: m.strikes,
    solved: { ...m.solved },
    log: room.log.slice(-12),
    crew: crewOf(room.code),
  };
  if (role === "operator") {
    const d = m.device;
    const stage = m.keypadHistory.length;
    const current = d.keypad[stage];
    v.device = {
      serial: d.serial,
      wires: d.wires.map((color, i) => ({ color, cut: m.cut.includes(i) })),
      symbols: d.symbols.map((glyph, i) => ({ glyph, pressed: m.symbolPresses.includes(i) })),
      keypad: current
        ? { stage, display: current.display, keys: current.keys }
        : { stage, display: null, keys: d.keypad[d.keypad.length - 1].keys },
      switches: { lights: d.switches.lights, up: m.switches },
      override: d.override,
    };
  }
  return v;
}

function send(c: Client, room: Room): void {
  c.res.write(`data: ${JSON.stringify(view(room, c.role))}\n\n`);
}

function broadcast(room: Room): void {
  for (const c of clients.get(room.code) ?? []) send(c, room);
}

const roleOf = (raw: unknown): Role => (raw === "expert" ? "expert" : "operator");
const codeOf = (raw: string): string => raw.toUpperCase();

// Rooms that were live when the server last stopped either ran out of time
// while it was down, or need their countdown re-armed.
for (const row of db
  .prepare("SELECT code FROM rooms WHERE json_extract(state, '$.mission.status') = 'live'")
  .all() as { code: string }[]) {
  load(row.code);
}

// ---- Routes ----------------------------------------------------------------

export const roomRoutes = Router();

roomRoutes.post("/", (req, res) => {
  if (!playerFrom(req)) return void res.status(401).json({ error: "unknown player" });
  const room = createRoom();
  res.status(201).json({ code: room.code });
});

roomRoutes.get("/:code", (req, res) => {
  const room = load(codeOf(req.params.code));
  if (!room) return void res.status(404).json({ error: "no such room" });
  res.json(view(room, roleOf(req.query.role)));
});

roomRoutes.get("/:code/stream", (req, res) => {
  const room = load(codeOf(req.params.code));
  const player = getPlayer(req.query.player);
  if (!room) return void res.status(404).json({ error: "no such room" });
  if (!player) return void res.status(401).json({ error: "unknown player" });

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const client: Client = { res, player, role: roleOf(req.query.role) };
  const set = clients.get(room.code) ?? new Set();
  clients.set(room.code, set);
  set.add(client);
  if (room.mission.status === "live") enlist(room, player);
  broadcast(room);

  // a comment line every 25s keeps idle proxies from closing the stream
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    set.delete(client);
    broadcast(room);
  });
});

roomRoutes.post("/:code/actions", (req, res) => {
  const room = load(codeOf(req.params.code));
  const player = playerFrom(req);
  if (!room) return void res.status(404).json({ error: "no such room" });
  if (!player) return void res.status(401).json({ error: "unknown player" });
  const error = apply(room, player, req.body as Action);
  if (error) return void res.status(409).json({ error });
  save(room);
  broadcast(room);
  res.json(view(room, roleOf(req.query.role)));
});

// ---- Station log -----------------------------------------------------------

export const logRoutes = Router();

logRoutes.get("/", (req, res) => {
  const player = playerFrom(req);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const rows = db
    .prepare(
      `SELECT id, room_code, mission_no, outcome, modules_cleared, strikes, ms_left, crew, ended_at
       FROM missions ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as Record<string, string | number>[];
  const runs: LogRow[] = rows.map((r) => {
    const crew = JSON.parse(String(r.crew)) as LogRow["crew"];
    return {
      id: Number(r.id),
      roomCode: String(r.room_code),
      missionNo: Number(r.mission_no),
      outcome: r.outcome as Outcome,
      modulesCleared: Number(r.modules_cleared),
      strikes: Number(r.strikes),
      msLeft: Number(r.ms_left),
      crew,
      endedAt: Number(r.ended_at),
      mine: player !== null && crew.some((c) => c.tag === player.tag),
    };
  });
  const tally = (sql: string, ...params: string[]) => {
    const t = db.prepare(sql).get(...params) as { missions: number; defused: number | null };
    return { missions: t.missions, defused: t.defused ?? 0 };
  };
  const log: StationLog = {
    totals: tally("SELECT COUNT(*) AS missions, SUM(outcome = 'defused') AS defused FROM missions"),
    you: player
      ? tally(
          `SELECT COUNT(*) AS missions, SUM(outcome = 'defused') AS defused
           FROM missions, json_each(missions.crew) AS c
           WHERE json_extract(c.value, '$.tag') = ?`,
          player.tag,
        )
      : null,
    runs,
  };
  res.json(log);
});
