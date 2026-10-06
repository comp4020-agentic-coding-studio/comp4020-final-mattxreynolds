import { inject } from "vitest";
import type { Action, Role, RoomView, StationLog } from "../shared/view.ts";

// A tiny client for the game's API, so each check reads as what a player does.
const baseUrl = inject("baseUrl");
export const url = (path: string): string => new URL(path, baseUrl).toString();

export interface TestPlayer {
  id: string;
  tag: string;
  callsign: string;
}

async function call<T>(path: string, player: TestPlayer | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: { "content-type": "application/json", ...(player ? { "x-player": player.id } : {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${body.error}`);
  return body as T;
}

export const newPlayer = (): Promise<TestPlayer> =>
  call("/api/players", null, { method: "POST", body: "{}" });

export const openRoom = async (p: TestPlayer): Promise<string> =>
  (await call<{ code: string }>("/api/rooms", p, { method: "POST" })).code;

export const look = (code: string, role: Role): Promise<RoomView> =>
  call(`/api/rooms/${code}?role=${role}`, null);

export const act = (p: TestPlayer, code: string, action: Action): Promise<RoomView> =>
  call(`/api/rooms/${code}/actions?role=operator`, p, { method: "POST", body: JSON.stringify(action) });

export const stationLog = (p: TestPlayer | null): Promise<StationLog> => call("/api/log?limit=100", p);

/** Opens a room's event stream; `next` resolves with each view as it arrives. */
export async function stream(code: string, role: Role, p: TestPlayer) {
  const controller = new AbortController();
  const res = await fetch(url(`/api/rooms/${code}/stream?role=${role}&player=${p.id}`), {
    signal: controller.signal,
  });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(): Promise<RoomView> {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end !== -1) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = event.split("\n").find((l) => l.startsWith("data: "));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream closed");
        buffer += value;
      }
    },
    close: () => controller.abort(),
  };
}
