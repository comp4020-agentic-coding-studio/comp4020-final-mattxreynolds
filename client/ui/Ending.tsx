import { useState } from "react";
import { ROLE_TITLE } from "../../shared/protocol.ts";
import { send } from "../net.ts";
import { useStore } from "../store.ts";
import { Debrief } from "./Debrief.tsx";

const fmt = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const PHASE_NAME: Record<string, string> = {
  PROLOGUE: "Act I · Impact",
  POWER: "Act I · Emergency Power",
  FLOOD: "Act II · Stabilisation",
  RADIO: "Act III · Mayday",
  CASCADE: "Act IV · Cascade",
  ESCAPE: "Act V · Abandon Ship",
};

export function Ending({ onHome }: { onHome: () => void }) {
  const view = useStore((s) => s.view)!;
  const o = view.outcome!;
  const survived = o.result === "SURVIVED";
  const [tab, setTab] = useState<"summary" | "debrief">("summary");
  return (
    <>
    <div className={`vignette ${survived ? "survived" : "lost"}`} aria-hidden>
      {survived ? (<><div className="sun" /><div className="sea" /><div className="boat" /></>) : <div className="bubbles" />}
    </div>
    <div className={`overlay ending ${survived ? "survived" : "lost"}`}>
      <div className={`card center ${tab === "debrief" ? "wide" : ""}`}>
        <p className="kicker">
          Voyage {view.code}
          {view.practice && <span className="tag practice">PRACTICE</span>}
        </p>
        <h1 className="headline" data-testid="outcome">{survived ? (view.practice ? "Practice survived" : "You made it off") : "The ship went down"}</h1>
        {o.debrief && (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "on" : ""} onClick={() => setTab("summary")}>Summary</button>
            <button role="tab" aria-selected={tab === "debrief"} className={tab === "debrief" ? "on" : ""} data-testid="debrief-tab" onClick={() => setTab("debrief")}>Incident reconstruction</button>
          </div>
        )}
        {tab === "debrief" && o.debrief ? (
          <Debrief d={o.debrief} />
        ) : (
        <>
        {survived ? (
          <p className="lede">
            The door gives, the sea takes the hull behind you, and the lifeboat drops clear. Somewhere out there, a station has your
            position.
          </p>
        ) : (
          <>
            <p className="cause">{o.failureCause ?? "The ship went down"}.</p>
            <p className="lede">
              The flooding reached 100% during <b>{PHASE_NAME[o.phaseReached] ?? o.phaseReached}</b>. Open the incident
              reconstruction to see exactly where the water came from.
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
        {o.debrief && o.debrief.lessons.length > 0 && (
          <ul className="lessons-short">
            {o.debrief.lessons.slice(0, 3).map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        </>
        )}
        <button className="primary big" data-testid="sail-again" onClick={() => send({ t: "sailAgain" })}>
          Sail again together
        </button>
        <p className="hint">
          Same crew, same roles, a new ship with new faults. Your partner comes too. Or{" "}
          <button className="link" data-testid="same-ship" onClick={() => send({ t: "sailAgain", sameShip: true })}>
            sail this same ship again
          </button>{" "}
          to put what you learned straight to use.
        </p>
        <p>
          <a href="/history/">Ship's Log</a> · <a href={`/log/${view.code}/`}>Debrief page</a> · <button className="link" onClick={onHome}>Back to port</button>
        </p>
      </div>
    </div>
    </>
  );
}
