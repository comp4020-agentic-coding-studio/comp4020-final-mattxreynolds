import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "../../shared/game.ts";
import type { Action, Role, RoomView } from "../../shared/view.ts";
import { api, type Me } from "./api.ts";

// Subscribes to a room's stream from one seat. Switching seat reconnects with
// the other role, which is also how the server knows who's sitting where.
export function useRoom(code: string, role: Role, me: Me | null) {
  const [view, setView] = useState<RoomView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0); // server clock minus ours

  const receive = useCallback((v: RoomView) => {
    offset.current = v.serverNow - Date.now();
    setView(v);
  }, []);

  useEffect(() => {
    if (!me) return;
    const es = new EventSource(
      `/api/rooms/${code}/stream?role=${role}&player=${encodeURIComponent(me.id)}`,
    );
    es.onmessage = (e) => receive(JSON.parse(e.data));
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return; // it'll retry by itself
      fetch(`/api/rooms/${code}`).then((r) => r.status === 404 && setMissing(true));
    };
    return () => es.close();
  }, [code, role, me, receive]);

  const act = useCallback(
    async (action: Action) => {
      if (!me) return;
      try {
        setError(null);
        receive(
          await api<RoomView>(`/api/rooms/${code}/actions?role=${role}`, me, {
            method: "POST",
            body: JSON.stringify(action),
          }),
        );
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [code, role, me, receive],
  );

  return { view, missing, error, act, offset };
}

/** The countdown as shown, ticking while the mission is live. */
export function useClock(view: RoomView | null, offset: { current: number }): { ms: number; text: string } {
  const [, tick] = useState(0);
  const live = view?.status === "live";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [live]);
  if (!view) return { ms: 0, text: "--:--" };
  const ms = live && view.endsAt ? Math.max(0, view.endsAt - (Date.now() + offset.current)) : view.msLeft;
  return { ms, text: formatClock(ms) };
}
