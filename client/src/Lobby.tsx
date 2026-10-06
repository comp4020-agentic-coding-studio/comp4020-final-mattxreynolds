import { useEffect, useState, type FormEvent } from "react";
import { formatClock, MODULES } from "../../shared/game.ts";
import type { StationLog } from "../../shared/view.ts";
import { api, lastRoom, type Me } from "./api.ts";
import { navigate } from "./App.tsx";

const OUTCOME_TEXT = { defused: "SECURED", exploded: "LOST · STRIKES", timeout: "LOST · TIME" };

function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

export function Lobby({ me, rename }: { me: Me | null; rename: (c: string) => Promise<void> }) {
  const [log, setLog] = useState<StationLog | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const previous = lastRoom();

  useEffect(() => {
    if (!me) return;
    const load = () => api<StationLog>("/api/log?limit=25", me).then(setLog, () => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [me]);

  const openRoom = async () => {
    try {
      const { code } = await api<{ code: string }>("/api/rooms", me, { method: "POST" });
      navigate(`/room/${code}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    try {
      await api(`/api/rooms/${code}`, me);
      navigate(`/room/${code}`);
    } catch {
      setError(`No room with code ${code || "····"}. Check it with your teammate.`);
    }
  };

  const saveCallsign = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await rename(draft);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <div className="intro">
        <div>
          <div className="eyebrow">STATION 09 · NIGHT SHIFT</div>
          <h1>Stay calm. Keep talking.</h1>
          <p>
            A two-seat defusal game. The Operator holds the device, the Expert holds the manual,
            and neither can finish alone. Every run goes on the station log.
          </p>
        </div>
      </div>

      <div className="lobby">
        <section className="console lobby-panel">
          <div className="console-head">
            <span>CREW TERMINAL</span>
            <span>{me ? "IDENTIFIED" : "CONNECTING"}</span>
          </div>
          <div className="lobby-body">
            <div className="label">YOU ARE</div>
            {editing ? (
              <form className="callsign-form" onSubmit={saveCallsign}>
                <input
                  aria-label="New callsign"
                  value={draft}
                  maxLength={16}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="primary small">Save</button>
                <button type="button" className="quiet" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="callsign-row">
                <span className="big-callsign">{me?.callsign ?? "······"}</span>
                <button
                  className="quiet"
                  disabled={!me}
                  onClick={() => {
                    setDraft(me?.callsign ?? "");
                    setEditing(true);
                  }}
                >
                  Rename
                </button>
              </div>
            )}
            {log?.you && log.you.missions > 0 ? (
              <p className="welcome">
                Welcome back. {log.you.missions} mission{log.you.missions === 1 ? "" : "s"} on record,{" "}
                {log.you.defused} secured. Your runs are marked below.
              </p>
            ) : (
              <p className="welcome">No missions on record yet. Your first run will be logged here.</p>
            )}

            <div className="rule" />
            <button className="primary" disabled={!me} onClick={openRoom}>
              Open a new room
            </button>
            <p className="hint">
              You get your own room and device. Play both seats yourself, or share the code so a
              teammate can take the other seat from their own screen.
            </p>
            <form className="join" onSubmit={join}>
              <label htmlFor="join-code" className="label">
                JOIN A TEAMMATE
              </label>
              <div>
                <input
                  id="join-code"
                  placeholder="CODE"
                  value={joinCode}
                  maxLength={4}
                  autoComplete="off"
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button className="quiet" disabled={!me || joinCode.trim().length !== 4}>
                  Join room
                </button>
              </div>
            </form>
            {previous ? (
              <button className="linkish" onClick={() => navigate(`/room/${previous}`)}>
                Rejoin your last room, {previous} →
              </button>
            ) : null}
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section className="station-log" aria-labelledby="station-log-title">
          <div className="aside-heading">STATION LOG</div>
          <h2 id="station-log-title">Every shift, on the record.</h2>
          <p>
            {log
              ? `${log.totals.missions} mission${log.totals.missions === 1 ? "" : "s"} logged · ${log.totals.defused} secured`
              : "Reading the log…"}
          </p>
          {log && log.runs.length === 0 ? (
            <p className="empty">The log is empty. Be the first crew on it.</p>
          ) : null}
          <ol className="runs">
            {log?.runs.map((r) => (
              <li key={r.id} className={`run ${r.outcome}${r.mine ? " mine" : ""}`}>
                <span className="run-outcome">{OUTCOME_TEXT[r.outcome]}</span>
                <span className="run-crew">
                  {r.crew.map((c) => c.callsign).join(" + ") || "Unknown crew"}
                  {r.mine ? <em>YOU</em> : null}
                </span>
                <span className="run-stats">
                  {r.modulesCleared}/{MODULES.length} modules · {formatClock(r.msLeft)} left ·{" "}
                  {r.strikes} strike{r.strikes === 1 ? "" : "s"}
                </span>
                <span className="run-when">
                  ROOM {r.roomCode} · #{String(r.missionNo).padStart(3, "0")} · {ago(r.endedAt)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
