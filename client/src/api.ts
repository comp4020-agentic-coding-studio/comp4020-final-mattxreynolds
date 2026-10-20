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

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T>(path: string, me: Me | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(me ? { "x-player": me.id } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch((error: unknown) => {
    // An incomplete acknowledgement is uncertain even after successful headers.
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
    return {};
  });
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

async function ensurePlayer(): Promise<Me> {
  const id = stored(PLAYER_KEY);
  if (id) {
    try {
      return await api<Me>("/api/players/me", { id, tag: "", callsign: "" }, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
      // Only a confirmed missing identity permits replacement. A dropped
      // connection or server failure says nothing about who this browser is.
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }
  const me = await api<Me>("/api/players", null, { method: "POST", body: "{}", signal: AbortSignal.timeout(5000) });
  store(PLAYER_KEY, me.id);
  return me;
}

export function usePlayer() {
  const [me, setMe] = useState<Me | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => { setIdentityError(false); setAttempt(n => n + 1); };
  useEffect(() => {
    let closed = false, failed = false;
    ensurePlayer().then(player => { if (!closed) setMe(player); }, () => {
      failed = true;
      if (!closed) setIdentityError(true);
    });
    const online = () => { if (failed) retry(); };
    addEventListener("online", online);
    return () => { closed = true; removeEventListener("online", online); };
  }, [attempt]);
  const rename = async (callsign: string): Promise<void> => {
    if (!me) return;
    setMe(
      await api<Me>("/api/players/me", me, {
        method: "PATCH",
        body: JSON.stringify({ callsign }),
      }),
    );
  };
  return { me, rename, identityError, retry };
}
