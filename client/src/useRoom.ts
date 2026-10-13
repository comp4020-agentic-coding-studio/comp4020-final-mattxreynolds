import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "../../shared/game.ts";
import type { Action, Role, RoomView } from "../../shared/view.ts";
import { api, type Me } from "./api.ts";

// Subscribes to a room's stream from one seat. Switching seat reconnects with
// the other role, which is also how the server knows who's sitting where.
export function useRoom(code: string, role: Role, me: Me | null) {
  const [snapshot, setView] = useState<RoomView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const offset = useRef(0); // server clock minus ours; approximate by receive time
  // A seat change must immediately hide the previous seat's projection.
  const view = snapshot?.role === role ? snapshot : null;

  useEffect(() => {
    setView(null);
    setMissing(false);
    setError(null);
    setConnection("connecting");
    if (!me) return;
    let closed = false;
    const es = new EventSource(
      `/api/rooms/${code}/stream?role=${role}&player=${encodeURIComponent(me.id)}`,
    );
    es.onmessage = (e) => {
      if (closed) return;
      const v: RoomView = JSON.parse(e.data);
      if (v.role !== role || v.code !== code) return;
      offset.current = v.serverNow - Date.now();
      setView((previous) => previous && previous.revision > v.revision ? previous : v);
      setConnection("live");
    };
    const lost = () => { if (!closed) setConnection("reconnecting"); };
    es.onerror = () => {
      lost();
      if (es.readyState !== EventSource.CLOSED) return;
      fetch(`/api/rooms/${code}?role=${role}`)
        .then((r) => { if (!closed && r.status === 404) setMissing(true); })
        .catch(() => {});
    };
    addEventListener("offline", lost);
    return () => { closed = true; removeEventListener("offline", lost); es.close(); };
  }, [code, role, me]);

  const act = useCallback(
    async (action: Action) => {
      if (!me || !view || connection !== "live" || sending.current) return;
      sending.current = true;
      setPending(true);
      try {
        setError(null);
        // SSE owns room state. A delayed HTTP acknowledgement must never roll
        // back a newer event (including a new mission or final result).
        await api<RoomView>(`/api/rooms/${code}/actions?role=${role}`, me, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ ...action, missionNo: view.missionNo, revision: view.revision }),
        });
      } catch (e) {
        setError(e instanceof TypeError || (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name))
          ? "Request outcome uncertain. Check the recovered device before acting again."
          : (e as Error).message);
      } finally {
        sending.current = false;
        setPending(false);
      }
    },
    [code, role, me, view, connection],
  );

  return { view, missing, error, act, offset, connection, pending };
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
