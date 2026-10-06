import { useEffect, useState } from "react";

// Who you are: an anonymous id the server issued, kept in this browser, plus
// the callsign everyone else sees. If storage is unavailable you're simply a
// new player each visit.
export interface Me {
  id: string;
  tag: string;
  callsign: string;
}

const PLAYER_KEY = "dead-air.player";
const LAST_ROOM_KEY = "dead-air.last-room";

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window or blocked storage: carry on without it
  }
}

export const lastRoom = (): string | null => stored(LAST_ROOM_KEY);
export const rememberRoom = (code: string): void => store(LAST_ROOM_KEY, code);

export async function api<T>(path: string, me: Me | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(me ? { "x-player": me.id } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

async function ensurePlayer(): Promise<Me> {
  const id = stored(PLAYER_KEY);
  if (id) {
    try {
      return await api<Me>("/api/players/me", { id, tag: "", callsign: "" });
    } catch {
      // unknown to the server (a wiped database, say): register afresh
    }
  }
  const me = await api<Me>("/api/players", null, { method: "POST", body: "{}" });
  store(PLAYER_KEY, me.id);
  return me;
}

export function usePlayer() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    ensurePlayer().then(setMe, () => setMe(null));
  }, []);
  const rename = async (callsign: string): Promise<void> => {
    if (!me) return;
    setMe(
      await api<Me>("/api/players/me", me, {
        method: "PATCH",
        body: JSON.stringify({ callsign }),
      }),
    );
  };
  return { me, rename };
}
