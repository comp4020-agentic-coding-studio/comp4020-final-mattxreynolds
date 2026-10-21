// Socket-level players for app specs: each is an independent identity
// (its own token, its own socket), exactly like a separate browser profile.

import { io, type Socket } from "socket.io-client";
import type { Intent, IntentAck, View } from "../../shared/protocol.ts";

export type Player = {
  code: string;
  token: string;
  role: string;
  socket: Socket;
  view: View | null;
  views: View[];
  send(intent: Intent): Promise<IntentAck>;
  waitFor(pred: (v: View) => boolean, ms?: number): Promise<View>;
  close(): void;
};

export async function post(baseUrl: string, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

export async function connectPlayer(baseUrl: string, seat: { code: string; token: string; role: string }): Promise<Player> {
  const socket = io(baseUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
  const p: Player = {
    ...seat,
    socket,
    view: null,
    views: [],
    send: (intent) => socket.timeout(4000).emitWithAck("intent", { seq: 1, intent }) as Promise<IntentAck>,
    waitFor: (pred, ms = 5000) =>
      new Promise((resolve, reject) => {
        if (p.view && pred(p.view)) return resolve(p.view);
        const timer = setTimeout(() => {
          socket.off("view", on);
          reject(new Error(`timed out waiting for view; last phase=${p.view?.phase}`));
        }, ms);
        const on = (v: View) => {
          if (pred(v)) {
            clearTimeout(timer);
            socket.off("view", on);
            resolve(v);
          }
        };
        socket.on("view", on);
      }),
    close: () => socket.close(),
  };
  socket.on("view", (v: View) => {
    p.view = v;
    p.views.push(v);
    if (p.views.length > 50) p.views.shift();
  });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect_error", reject);
    socket.on("connect", () => resolve());
  });
  const ack = await socket.emitWithAck("hello", { code: seat.code, token: seat.token });
  if (!ack.ok) throw new Error(`hello failed: ${ack.reason}`);
  await p.waitFor(() => true);
  return p;
}

/** Creates a voyage with two seated, connected players. */
export async function crew(baseUrl: string, names = ["ADA", "LIN"]): Promise<[Player, Player]> {
  const a = await post(baseUrl, "/api/voyages", { callsign: names[0] });
  const b = await post(baseUrl, `/api/voyages/${a.json.code}/join`, { callsign: names[1] });
  const eng = await connectPlayer(baseUrl, a.json);
  const nav = await connectPlayer(baseUrl, b.json);
  return [eng, nav];
}

/** Both ready → PROLOGUE. */
export async function launch(baseUrl: string, names?: string[]): Promise<[Player, Player]> {
  const [eng, nav] = await crew(baseUrl, names);
  await eng.send({ t: "setReady", ready: true });
  await nav.send({ t: "setReady", ready: true });
  await eng.waitFor((v) => v.phase === "PROLOGUE");
  await nav.waitFor((v) => v.phase === "PROLOGUE");
  return [eng, nav];
}

export const testHooks = (): boolean => process.env.APP_TEST_HOOKS === "1";

export async function hidden(baseUrl: string, code: string): Promise<any> {
  const res = await fetch(new URL(`/api/test/voyages/${code}`, baseUrl));
  return res.json();
}

export async function patch(baseUrl: string, code: string, body: unknown): Promise<void> {
  await post(baseUrl, `/api/test/voyages/${code}/patch`, body);
}

// ---------------------------------------------------------------- extras
// Used by the specs that run against their own server (spec/helpers/server.ts).

/** A connected socket that has never sent hello — a stranger. */
export async function strangerSocket(baseUrl: string): Promise<Socket> {
  const socket = io(baseUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect_error", reject);
    socket.on("connect", () => resolve());
  });
  return socket;
}

/** Resolves with the next `event` payload on this socket. */
export function nextEvent<T = any>(socket: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    const on = (data: T) => {
      clearTimeout(timer);
      socket.off(event, on);
      resolve(data);
    };
    socket.on(event, on);
  });
}

export type VoyageEvent = { at: number; kind: string; detail: string | null };

/** Test hook: the voyage's public event log, oldest first. */
export async function events(baseUrl: string, code: string): Promise<VoyageEvent[]> {
  const res = await fetch(new URL(`/api/test/voyages/${code}/events`, baseUrl));
  if (!res.ok) throw new Error(`events hook answered ${res.status} (is ENABLE_TEST_HOOKS on?)`);
  return res.json();
}

/** Test hook: patch the canonical voyage; if it names a phase, wait until
 * every player's view shows it. */
export async function jump(baseUrl: string, players: Player[], body: Record<string, unknown>): Promise<void> {
  const res = await fetch(new URL(`/api/test/voyages/${players[0].code}/patch`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patch hook answered ${res.status}`);
  const phase = body.phase;
  if (typeof phase === "string") await Promise.all(players.map((p) => p.waitFor((v) => v.phase === phase)));
}

/** PROLOGUE → POWER through the real intents. */
export async function throughPrologue(eng: Player, nav: Player): Promise<void> {
  await eng.send({ t: "prologueBreaker" });
  await nav.waitFor((v) => v.prologue.busOn);
  await nav.send({ t: "prologueAck" });
  await eng.waitFor((v) => v.phase === "POWER");
  await nav.waitFor((v) => v.phase === "POWER");
}

/** Jumps to ESCAPE with the door open, then both pull ABANDON → SURVIVED. */
export async function survive(baseUrl: string, eng: Player, nav: Player): Promise<void> {
  await jump(baseUrl, [eng, nav], { phase: "ESCAPE", deepestPhase: "ESCAPE", escape: { door: 100 } });
  await Promise.all([eng.send({ t: "abandon" }), nav.send({ t: "abandon" })]);
  await eng.waitFor((v) => v.phase === "SURVIVED");
  await nav.waitFor((v) => v.phase === "SURVIVED");
}
