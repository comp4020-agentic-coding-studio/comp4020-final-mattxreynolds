// Socket client. Identity is the per-voyage seat token in localStorage
// (docs/MULTIPLAYER.md); every (re)connect re-sends hello for a full snapshot.

import { io, type Socket } from "socket.io-client";
import type { HelloAck, Intent, IntentAck, RejectReason, Role, View, Fx } from "../shared/protocol.ts";
import { playUse } from "./audio.ts";
import { emitFx, toast, useStore } from "./store.ts";

const KEY = (code: string) => `btw.seat.${code}`;
/** The most recent voyage this browser holds a seat in (crew lineage). */
const LAST = "btw.lastVoyage";

export function savedToken(code: string): string | null {
  try {
    return localStorage.getItem(KEY(code));
  } catch {
    return null;
  }
}
function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(KEY(code), token);
    localStorage.setItem(LAST, code);
  } catch {
    // private mode with storage disabled: the seat lasts this tab only
  }
}
export function forgetToken(code: string): void {
  try {
    localStorage.removeItem(KEY(code));
  } catch {
    /* ignore */
  }
}

let socket: Socket | null = null;
let current: { code: string; token: string } | null = null;
let seq = 0;
/** The latest connect() caller's failure handler (survives sail-again moves). */
let failHandler: (reason: string) => void = () => {};

export const REJECT_TEXT: Record<RejectReason, string> = {
  "not-seated": "You're not aboard this voyage",
  "wrong-phase": "That system isn't active right now",
  "wrong-role": "That's your partner's control",
  "bad-input": "That didn't register",
  "not-ready-to-start": "Waiting for both crew",
  "consoles-dead": "No power — the consoles are dead",
  "generator-tripped": "Generator tripped — wait for it to reset",
  "pump-bus-limit": "Pump bus overloaded — max 2 pumps",
  "carrier-locked": "Carrier locked — tuning is fixed",
  "not-coupled": "No carrier — the transmitter isn't coupled",
  "door-not-open": "The escape door isn't open yet",
  "too-fast": "Steady strokes",
  paused: "Ship systems holding — partner disconnected",
  "pump-seized": "That pump seized running dry — it needs a few seconds",
  "grid-down": "Generator tripped — the Engineer must reset it",
  "radio-unpowered": "No power to the radio circuit",
  "evac-offline": "Evac accumulator isn't powered",
  "evac-low": "Accumulator charge too low to hold the davits",
  "no-call": "No station is calling",
  "davits-not-armed": "Lifeboat davits aren't armed — the Bridge must arm them",
  locked: "Not unlocked yet",
};

/** A cinematic plays only on a transition seen live (not on a reconnect). */
function cinematicFor(prev: View | null, v: View): { cinematic?: { shot: "intro" | "survived" | "lost"; start: number } } {
  if (!prev || prev.code !== v.code || prev.phase === v.phase) return {};
  const start = performance.now() / 1000;
  if (prev.phase === "LOBBY" && v.phase === "PROLOGUE") return { cinematic: { shot: "intro", start } };
  if (v.phase === "SURVIVED" && !v.practice) return { cinematic: { shot: "survived", start } };
  if (v.phase === "LOST") return { cinematic: { shot: "lost", start } };
  return {};
}

export type SeatResult = { code: string; token: string; role: string } | { error: string };

async function seatRequest(url: string, callsign: string, extra: Record<string, unknown> = {}): Promise<SeatResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callsign, ...extra }),
    });
    return (await res.json()) as SeatResult;
  } catch {
    return { error: "network" };
  }
}

/** Creating from a browser that already sailed keeps that crew's unlocks;
 * `ship` replays a specific ship number (seed). */
export async function createVoyage(callsign: string, ship?: number): Promise<SeatResult> {
  let from: { code: string; token: string } | undefined;
  try {
    const code = localStorage.getItem(LAST);
    const token = code ? savedToken(code) : null;
    if (code && token) from = { code, token };
  } catch {
    /* storage disabled: a fresh crew */
  }
  const r = await seatRequest("/api/voyages", callsign, { from, ship });
  if ("token" in r) saveToken(r.code, r.token);
  return r;
}

export async function joinVoyage(code: string, callsign: string): Promise<SeatResult> {
  const r = await seatRequest(`/api/voyages/${encodeURIComponent(code)}/join`, callsign);
  if ("token" in r) saveToken(r.code, r.token);
  return r;
}

export type Peek = { code: string; phase: string; crew: { role: string; callsign: string }[] };
export async function peekVoyage(code: string): Promise<Peek | null> {
  try {
    const res = await fetch(`/api/voyages/${encodeURIComponent(code)}?soft=1`);
    const body = res.ok ? ((await res.json()) as Peek | { found: false }) : null;
    return body && "code" in body ? body : null;
  } catch {
    return null;
  }
}

/** Connects (or reconnects) to the voyage this browser holds a seat in. */
export function connect(code: string, onFail: (reason: string) => void): void {
  const token = savedToken(code);
  failHandler = onFail;
  if (!token) return onFail("bad-token");
  // already seated on this voyage with this token (e.g. App catching up with a
  // sail-again move): the socket re-hellos by itself on every reconnect
  if (socket && current?.code === code && current.token === token) return;
  current = { code, token };
  useStore.setState({ code, conn: "connecting", view: null, cinematic: null });
  if (!socket) {
    socket = wire(io({ transports: ["websocket", "polling"], reconnectionDelayMax: 3000 }));
  } else if (socket.connected) {
    hello();
  }
  devAttach(code);
}

/** Handlers act only while this socket is the active one: in dev mode two
 * sockets swap roles (active seat ↔ partner seat), so each checks. */
function wire(s: Socket): Socket {
  s.on("connect", () => (s === socket ? hello() : devHello()));
  s.on("disconnect", () => s === socket && useStore.setState({ conn: "offline" }));
  s.on("view", (v: View) => {
    if (s !== socket) {
      if (dev) dev.view = v;
      return;
    }
    const prev = useStore.getState().view;
    // views carry a monotonic rev; drop any that arrive out of order
    if (prev && prev.code === v.code && v.rev < prev.rev) return;
    useStore.setState({ view: v, ...cinematicFor(prev, v) });
  });
  s.on("fx", (list: Fx[]) => s === socket && list.forEach(emitFx));
  s.on("moved", (m: { code: string; by: string }) => {
    if (s !== socket || !current) return;
    if (dev) saveDevSeats(m.code, loadDevSeats(current.code)!);
    saveToken(m.code, current.token);
    history.replaceState(null, "", `/v/${m.code}`);
    connect(m.code, failHandler);
  });
  return s;
}

function hello(): void {
  if (!socket || !current) return;
  const sentFor = current.code;
  socket.emit("hello", current, (ack: HelloAck) => {
    if (current?.code !== sentFor) return;
    if (ack.ok) useStore.setState({ conn: "online" });
    else failHandler(ack.reason);
  });
}

export function disconnect(): void {
  current = null;
  socket?.disconnect();
  socket = null;
  dev?.socket.disconnect();
  dev = null;
  useStore.setState({ dev: null });
  useStore.setState({ conn: "idle", view: null, code: null });
}

/** Sends an intent. Feedback for rejections is shown automatically. */
export function send(intent: Intent): Promise<IntentAck> {
  if (intent.t !== "setReady" && intent.t !== "sailAgain") playUse();
  return new Promise((resolve) => {
    if (!socket?.connected) {
      toast("Reconnecting to the ship…", "warn");
      return resolve({ ok: false, reason: "bad-input", rev: 0 });
    }
    socket.timeout(5000).emit("intent", { seq: ++seq, intent }, (err: unknown, ack: IntentAck) => {
      if (err) {
        toast("No answer from the ship — try again", "warn");
        return resolve({ ok: false, reason: "bad-input", rev: 0 });
      }
      if (!ack.ok) {
        toast(REJECT_TEXT[ack.reason] ?? "That didn't register", "warn");
        emitFx({ k: "rejected", reason: ack.reason });
      }
      resolve(ack);
    });
  });
}

// ---------------------------------------------------------------- dev mode
// docs/DEV_MODE.md. A dev voyage gives this browser both seats' tokens. The
// partner seat stays connected on a second socket, so the server sees two
// present crew and never pauses; switching seats swaps which socket feeds
// the store and carries intents. Only reachable when /api/dev/* exists.

type DevSeats = Record<Role, string>;
const DEV_KEY = (code: string) => `btw.dev.${code}`;
let dev: { socket: Socket; code: string; role: Role; token: string; view: View | null } | null = null;

function loadDevSeats(code: string): DevSeats | null {
  try {
    const raw = localStorage.getItem(DEV_KEY(code));
    return raw ? (JSON.parse(raw) as DevSeats) : null;
  } catch {
    return null;
  }
}
function saveDevSeats(code: string, seats: DevSeats): void {
  try {
    localStorage.setItem(DEV_KEY(code), JSON.stringify(seats));
  } catch {
    /* ignore */
  }
}

export async function devAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/dev/status");
    return res.ok && ((await res.json()) as { dev?: boolean }).dev === true;
  } catch {
    return false;
  }
}

/** Creates a voyage with both seats held by this browser (you start as the Engineer). */
export async function devCreate(ship?: number): Promise<SeatResult> {
  try {
    const res = await fetch("/api/dev/voyages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ship }),
    });
    if (!res.ok) return { error: "network" };
    const r = (await res.json()) as { code: string; seats: { role: Role; token: string }[] };
    const seats = Object.fromEntries(r.seats.map((x) => [x.role, x.token])) as DevSeats;
    saveDevSeats(r.code, seats);
    try {
      localStorage.setItem(KEY(r.code), seats.ENGINEER);
    } catch {
      /* ignore */
    }
    return { code: r.code, token: seats.ENGINEER, role: "ENGINEER" };
  } catch {
    return { error: "network" };
  }
}

/** On connect(): if this browser holds both seats, seat the partner too. */
function devAttach(code: string): void {
  const seats = loadDevSeats(code);
  if (!seats || !current) {
    if (dev && dev.code !== code) {
      dev.socket.disconnect();
      dev = null;
      useStore.setState({ dev: null });
    }
    return;
  }
  const role: Role = seats.ENGINEER === current.token ? "NAVIGATOR" : "ENGINEER";
  if (dev && dev.code === code && dev.role === role) return;
  if (dev) {
    dev.code = code;
    dev.role = role;
    dev.token = seats[role];
    dev.view = null;
  } else {
    dev = { socket: wire(io({ transports: ["websocket", "polling"], reconnectionDelayMax: 3000, forceNew: true })), code, role, token: seats[role], view: null };
  }
  useStore.setState({ dev: { partner: role } });
  if (dev.socket.connected) devHello();
}

function devHello(): void {
  if (!dev) return;
  dev.socket.emit("hello", { code: dev.code, token: dev.token }, (ack: HelloAck) => {
    if (!ack.ok) toast(`Dev: partner seat refused (${ack.reason})`, "warn");
  });
}

/** Swap seats: the partner socket becomes the active one and vice versa.
 * Neither socket reconnects, so the server sees no presence change. */
export function devSwitch(): void {
  if (!dev?.view || !socket || !current) return;
  const next = dev;
  const activeRole: Role = next.role === "ENGINEER" ? "NAVIGATOR" : "ENGINEER";
  const prevSocket = socket;
  const prevToken = current.token;
  socket = next.socket;
  current = { code: current.code, token: next.token };
  dev = { socket: prevSocket, code: current.code, role: activeRole, token: prevToken, view: useStore.getState().view };
  try {
    localStorage.setItem(KEY(current.code), current.token);
  } catch {
    /* ignore */
  }
  if (document.pointerLockElement) document.exitPointerLock();
  useStore.setState({ view: next.view, cinematic: null, prompt: null, dev: { partner: activeRole } });
}

/** Sends an intent from the partner seat (e.g. "ready both" in the lobby). */
export function devSendPartner(intent: Intent): Promise<IntentAck> {
  return new Promise((resolve) => {
    if (!dev?.socket.connected) return resolve({ ok: false, reason: "not-seated", rev: 0 });
    dev.socket.timeout(5000).emit("intent", { seq: ++seq, intent }, (err: unknown, ack: IntentAck) => resolve(err ? { ok: false, reason: "bad-input", rev: 0 } : ack));
  });
}

export async function devAction(action: { k: "skip" } | { k: "lose" } | { k: "danger"; value: number }): Promise<void> {
  if (!current) return;
  try {
    const res = await fetch(`/api/dev/voyages/${current.code}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: current.token, action }),
    });
    if (!res.ok) toast(`Dev: ${((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.status}`, "warn");
  } catch {
    toast("Dev: no answer from the server", "warn");
  }
}
