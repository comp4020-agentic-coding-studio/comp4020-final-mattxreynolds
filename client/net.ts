// Socket client. Identity is the per-voyage seat token in localStorage
// (docs/MULTIPLAYER.md); every (re)connect re-sends hello for a full snapshot.

import { io, type Socket } from "socket.io-client";
import type { HelloAck, Intent, IntentAck, RejectReason, View, Fx } from "../shared/protocol.ts";
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
    socket = io({ transports: ["websocket", "polling"], reconnectionDelayMax: 3000 });
    socket.on("connect", () => hello());
    socket.on("disconnect", () => useStore.setState({ conn: "offline" }));
    socket.on("view", (v: View) => {
      const prev = useStore.getState().view;
      // views carry a monotonic rev; drop any that arrive out of order
      if (prev && prev.code === v.code && v.rev < prev.rev) return;
      useStore.setState({ view: v, ...cinematicFor(prev, v) });
    });
    socket.on("fx", (list: Fx[]) => list.forEach(emitFx));
    socket.on("moved", (m: { code: string; by: string }) => {
      if (!current) return;
      saveToken(m.code, current.token);
      history.replaceState(null, "", `/v/${m.code}`);
      connect(m.code, failHandler);
    });
  } else if (socket.connected) {
    hello();
  }
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
