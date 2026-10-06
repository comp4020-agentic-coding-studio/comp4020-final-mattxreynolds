import { useEffect, useRef, useState } from "react";
import { formatClock, MAX_STRIKES, MODULES } from "../../shared/game.ts";
import type { Role } from "../../shared/view.ts";
import { rememberRoom, type Me } from "./api.ts";
import { navigate } from "./App.tsx";
import { Manual } from "./Manual.tsx";
import { Device } from "./modules.tsx";
import { useClock, useRoom } from "./useRoom.ts";

const ROLE_KEY = "dead-air.role";

function initialRole(): Role {
  try {
    return sessionStorage.getItem(ROLE_KEY) === "expert" ? "expert" : "operator";
  } catch {
    return "operator";
  }
}

export function Room({ code, me }: { code: string; me: Me | null }) {
  const [role, setRole] = useState<Role>(initialRole);
  const { view, missing, error, act, offset } = useRoom(code, role, me);
  const clock = useClock(view, offset);
  const [copied, setCopied] = useState(false);
  const [struck, setStruck] = useState(false);
  const strikes = useRef(0);

  // flash the console on every new strike, on every screen in the room
  useEffect(() => {
    const now = view?.strikes ?? 0;
    if (now > strikes.current) {
      setStruck(true);
      const t = setTimeout(() => setStruck(false), 600);
      strikes.current = now;
      return () => clearTimeout(t);
    }
    strikes.current = now;
  }, [view?.strikes]);

  useEffect(() => rememberRoom(code), [code]);
  const choose = (r: Role) => {
    setRole(r);
    try {
      sessionStorage.setItem(ROLE_KEY, r);
    } catch {
      // fine: the seat just won't survive a reload
    }
  };

  if (missing) {
    return (
      <div className="intro">
        <div>
          <div className="eyebrow">NO SIGNAL</div>
          <h1>There's no room {code}.</h1>
          <p>Check the code with your teammate, or open a room of your own.</p>
          <button className="primary inline" onClick={() => navigate("/")}>
            Back to the station
          </button>
        </div>
      </div>
    );
  }

  const status = view?.status ?? "ready";
  const solvedCount = view ? MODULES.filter((m) => view.solved[m]).length : 0;
  const condition =
    status === "ready"
      ? "AWAITING OPERATOR"
      : status === "live"
        ? "MISSION IN PROGRESS"
        : view?.outcome === "defused"
          ? "DEVICE SECURED"
          : "MISSION FAILED";
  const missionNo = String(view?.missionNo ?? 1).padStart(3, "0");
  const link = `${location.origin}/room/${code}`;
  const others = view?.crew.filter((c) => c.tag !== me?.tag) ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the code is on screen anyway
    }
  };

  return (
    <>
      <div className="intro">
        <div>
          <div className="eyebrow">MISSION {missionNo} · ROOM {code}</div>
          <h1>Stay calm. Keep talking.</h1>
          <p>One operator. One expert. Only one sees the device.</p>
        </div>
        <div className="room">
          ROOM <strong>{code}</strong>
          <span>
            <button className="linkish" onClick={copy}>
              {copied ? "Link copied" : "Copy invite link"}
            </button>{" "}
            · {others.length === 0 ? "just you" : `${others.length + 1} connected`}
          </span>
        </div>
      </div>

      <nav aria-label="Choose seat">
        <button
          className={`tab${role === "operator" ? " active" : ""}`}
          aria-pressed={role === "operator"}
          onClick={() => choose("operator")}
        >
          01 <strong>Operator</strong>
          <span>The device is in your hands</span>
        </button>
        <button
          className={`tab${role === "expert" ? " active" : ""}`}
          aria-pressed={role === "expert"}
          onClick={() => choose("expert")}
        >
          02 <strong>Expert</strong>
          <span>The manual has the answers</span>
        </button>
      </nav>

      <div className="workspace">
        <section className={`console ${status}${view?.outcome ? ` ${view.outcome}` : ""}${struck ? " struck" : ""}`}>
          <div className="console-head">
            <span>DEVICE // {view?.device?.serial ? `DA-${view.device.serial.slice(-3)}` : "NOT IN VIEW"}</span>
            <span>{condition}</span>
          </div>
          <div className="status">
            <div>
              <span className="label">TIME REMAINING</span>
              <div id="timer" className={clock.ms < 30_000 && status === "live" ? "urgent" : ""}>
                {clock.text}
              </div>
            </div>
            <div>
              <span className="label">STRIKES</span>
              <div id="strikes" aria-label={`${view?.strikes ?? 0} of ${MAX_STRIKES} strikes`}>
                {Array.from({ length: MAX_STRIKES }, (_, i) => (i < (view?.strikes ?? 0) ? "●" : "○")).join(" ")}
              </div>
            </div>
            <div>
              <span className="label">MODULES</span>
              <div id="progress">
                {solvedCount} <small>/ {MODULES.length}</small>
              </div>
            </div>
          </div>

          {view?.status === "over" ? (
            <div className={`result ${view.outcome}`} role="status">
              <div>
                <strong>
                  {view.outcome === "defused"
                    ? "Device secured."
                    : view.outcome === "timeout"
                      ? "Out of time."
                      : "Three strikes."}
                </strong>
                <span>
                  {solvedCount}/{MODULES.length} modules · {formatClock(view.msLeft)} left · logged to the
                  station
                </span>
              </div>
              <button className="primary small" onClick={() => act({ type: "newMission" })}>
                New mission
              </button>
            </div>
          ) : null}

          {!view ? (
            <div className="loading">Establishing link to room {code}…</div>
          ) : role === "operator" && view.device ? (
            <Device view={view} clock={clock.text} act={act} />
          ) : (
            <Manual />
          )}

          <div className="console-bottom">
            <span>POWER: STABLE</span>
            <span>COMMUNICATION IS YOUR BEST TOOL</span>
            <span>LINK: {view ? "LIVE" : "…"}</span>
          </div>
        </section>

        <aside>
          <div className="aside-heading">MISSION BRIEF</div>
          <h2>
            Trust the voice
            <br />
            on the other end.
          </h2>
          <p>
            Defuse all five modules before time runs out. Three mistakes end the mission. Clear the
            override last.
          </p>
          <div className="label">IN THE ROOM</div>
          {view?.crew.length ? (
            view.crew.map((c) => (
              <div className="crew" key={`${c.tag}:${c.role}`}>
                <div className={`avatar${c.role === "expert" ? " expert-avatar" : ""}`}>
                  {c.role === "expert" ? "EX" : "OP"}
                </div>
                <div>
                  <strong>
                    {c.callsign}
                    {c.tag === me?.tag ? " (you)" : ""}
                  </strong>
                  <span>{c.role === "expert" ? "Expert · manual access" : "Operator · device access"}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="hint">Connecting…</p>
          )}
          <div className="rule" />
          <div className="label">MISSION LOG</div>
          <ol id="log" role="status" aria-live="polite">
            {view?.log
              .slice(-6)
              .reverse()
              .map((entry) => (
                <li key={`${entry.at}-${entry.text}`} className={entry.tone}>
                  {entry.text}
                </li>
              ))}
          </ol>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {status === "over" ? (
            <button className="primary" onClick={() => act({ type: "newMission" })}>
              New mission
            </button>
          ) : (
            <button className="primary" disabled={status === "live" || !view} onClick={() => act({ type: "start" })}>
              {status === "live" ? "Mission in progress" : "Begin mission"}
            </button>
          )}
          <div className="hint">
            {status === "over"
              ? "This run is on the station log. A new mission brings a fresh device."
              : "Playing alone? Switch seats with the tabs above. The clock starts on Begin or on the first action."}
          </div>
        </aside>
      </div>
    </>
  );
}
