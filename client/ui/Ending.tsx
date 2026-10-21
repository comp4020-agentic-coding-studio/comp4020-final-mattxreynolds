import { ROLE_TITLE } from "../../shared/protocol.ts";
import { send } from "../net.ts";
import { useStore } from "../store.ts";

const fmt = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const PHASE_NAME: Record<string, string> = {
  PROLOGUE: "Prologue",
  POWER: "Emergency Power",
  FLOOD: "Flood Control",
  RADIO: "Distress Signal",
  ESCAPE: "Final Escape",
};

export function Ending({ onHome }: { onHome: () => void }) {
  const view = useStore((s) => s.view)!;
  const o = view.outcome!;
  const survived = o.result === "SURVIVED";
  return (
    <>
    <div className={`vignette ${survived ? "survived" : "lost"}`} aria-hidden>
      {survived ? (<><div className="sun" /><div className="sea" /><div className="boat" /></>) : <div className="bubbles" />}
    </div>
    <div className={`overlay ending ${survived ? "survived" : "lost"}`}>
      <div className="card center">
        <p className="kicker">Voyage {view.code}</p>
        <h1 data-testid="outcome">{survived ? "You made it off" : "The ship went down"}</h1>
        {survived ? (
          <p className="lede">
            The door gives, the sea takes the hull behind you, and the lifeboat drops clear. Somewhere out there, a station has your
            position.
          </p>
        ) : (
          <>
            <p className="cause">{o.failureCause ?? "The ship went down"}.</p>
            <p className="lede">
              The flooding reached 100% during <b>{PHASE_NAME[o.phaseReached] ?? o.phaseReached}</b>. Every mistake and every minute
              spent stuck adds water; finishing a phase pumps some out.
            </p>
          </>
        )}
        <dl className="summary">
          {view.crew.map((c) => (
            <div key={c.role}><dt>{ROLE_TITLE[c.role]}</dt><dd>{c.callsign}</dd></div>
          ))}
          <div><dt>Time</dt><dd>{fmt(o.durationMs)}</dd></div>
          <div><dt>Reached</dt><dd>{PHASE_NAME[o.phaseReached] ?? o.phaseReached}</dd></div>
          <div><dt>Mistakes</dt><dd>{o.mistakes}</dd></div>
        </dl>
        <button className="primary big" data-testid="sail-again" onClick={() => send({ t: "sailAgain" })}>
          Sail again together
        </button>
        <p className="hint">Same crew, same roles, a new ship with new puzzles. Your partner comes too.</p>
        <p>
          <a href="/history/">Ship's Log</a> · <button className="link" onClick={onHome}>Back to port</button>
        </p>
      </div>
    </div>
    </>
  );
}
