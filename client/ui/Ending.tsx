// The end of a voyage: a stencilled outcome with the act reached, the voyage
// strip (danger over time with the turning points marked), the turning-point
// cards, crew stats, what this run means for modes/practice/unlocks, and the
// way back to sea. The full incident reconstruction is the second tab.

import { useState } from "react";
import { MODE_RULES, NIGHTMARE_AFTER } from "../../shared/config.ts";
import { ACT_OF, ACT_TITLE, ROLE_TITLE, type Act, type Debrief as DebriefData, type Highlight, type Outcome } from "../../shared/protocol.ts";
import { send } from "../net.ts";
import { useStore } from "../store.ts";
import { clock, Debrief, VoyageStrip } from "./Debrief.tsx";

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
const ROMAN = ["", "I", "II", "III", "IV", "V"];
/** "Emergency Power · " when the phase isn't simply the act's own name. */
const phaseStep = (phase: string, act: Act): string => {
  const step = (PHASE_NAME[phase] ?? "").split(" · ")[1];
  return step && step !== ACT_TITLE[act] ? `${step} · ` : "";
};
const TONE_MARK: Record<Highlight["tone"], string> = { good: "▲", bad: "▼", info: "◆" };
const TONE_WORD: Record<Highlight["tone"], string> = { good: "Went right", bad: "Cost you", info: "Note" };

/** What this voyage means for the crew's modes, practice and unlocks, from
 * the rules in docs/SYSTEMS.md (the server computes the real unlock set from
 * SQLite when the crew is next in a lobby). */
function progress(o: Outcome, mode: DebriefData["mode"], practice: Act | null): { title: string; lines: string[] } {
  const survived = o.result === "SURVIVED";
  const act = (ACT_OF[o.phaseReached] || 1) as Act;
  const title = practice ? `Practice from Act ${ROMAN[practice]}` : `${MODE_RULES[mode]?.title ?? mode} · full voyage`;
  if (practice) {
    return {
      title,
      lines: [
        "Practice runs are logged but never count as a survived voyage, never unlock anything and stay out of the fastest-escape record.",
        survived ? "You've proved this act. A full voyage from Act I is what counts." : `Try Act ${ROMAN[practice]} again from the lobby, or sail the full voyage.`,
      ],
    };
  }
  const lines: string[] = [];
  if (survived && mode === "STANDARD") lines.push("Surviving Standard opens Rough Seas, Blackout, Rapid Flood and Chain Reaction for this crew.");
  else if (survived && mode !== "NIGHTMARE") lines.push(`A ${MODE_RULES[mode].title} escape counts toward All Systems: survive ${NIGHTMARE_AFTER} different challenge modes to open it.`);
  else if (survived) lines.push("All Systems survived: the hardest voyage this ship has.");
  else lines.push("Survive a full Standard voyage to open the challenge modes.");
  lines.push(
    survived
      ? "Practice from any act is open: rehearse the hardest part before the next full voyage."
      : `Practice from Act ${ROMAN[act]} · ${ACT_TITLE[act]} is open in the lobby, so you can rehearse exactly where it went wrong.`,
  );
  return { title, lines };
}

export function Ending({ onHome }: { onHome: () => void }) {
  const view = useStore((s) => s.view)!;
  const o = view.outcome!;
  const d = o.debrief;
  const survived = o.result === "SURVIVED";
  const [tab, setTab] = useState<"summary" | "debrief">("summary");
  const reachedAct = (ACT_OF[o.phaseReached] || 1) as Act;
  const prog = progress(o, view.mode, view.practice);
  const acts = d
    ? (Object.entries(d.actTimes) as [string, number][]).map(([a, t]) => ({ act: Number(a) as Act, t })).sort((a, b) => a.t - b.t)
    : [];
  return (
    <>
      <div className={`vignette ${survived ? "survived" : "lost"}`} aria-hidden>
        {survived ? (<><div className="sun" /><div className="sea" /><div className="boat" /></>) : <div className="bubbles" />}
      </div>
      <div className={`overlay ending ${survived ? "survived" : "lost"}`}>
        <article className="report">
          <header className="report-head">
            <p className="kicker">
              Voyage {view.code}
              {d && <> · ship No. {d.shipNo}</>}
              {view.practice && <span className="tag practice">PRACTICE</span>}
              {view.mode !== "STANDARD" && <span className="tag mode">{MODE_RULES[view.mode].title.toUpperCase()}</span>}
            </p>
            <h1 className="headline" data-testid="outcome">{survived ? (view.practice ? "Practice survived" : "You made it off") : "The ship went down"}</h1>
            <p className="reached">
              <span className="reached-act">{survived ? "All five acts" : `Act ${ROMAN[reachedAct]} · ${ACT_TITLE[reachedAct]}`}</span>
              <span className="reached-meta">{survived ? `escaped in ${fmt(o.durationMs)}` : `${phaseStep(o.phaseReached, reachedAct)}lost at ${fmt(o.durationMs)}`}</span>
            </p>
            {survived ? (
              <p className="lede">
                The door gives, the sea takes the hull behind you, and the lifeboat drops clear. Somewhere out there, a station has your position.
              </p>
            ) : (
              <>
                <p className="cause">{o.failureCause ?? "The ship went down"}.</p>
                <p className="lede">
                  The flooding reached 100% during <b>{PHASE_NAME[o.phaseReached] ?? o.phaseReached}</b>. The turning points below show where the water won.
                </p>
              </>
            )}
          </header>

          {d && (
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "on" : ""} onClick={() => setTab("summary")}>Voyage report</button>
              <button role="tab" aria-selected={tab === "debrief"} className={tab === "debrief" ? "on" : ""} data-testid="debrief-tab" onClick={() => setTab("debrief")}>Incident reconstruction</button>
            </div>
          )}

          {tab === "debrief" && d ? (
            <Debrief d={d} />
          ) : (
            <>
              {d && d.samples.length > 1 && (
                <section className="report-sec">
                  <h2 className="sec-title">The voyage</h2>
                  <VoyageStrip d={d} />
                </section>
              )}

              {d && (d.highlights.length > 0 || d.lessons.length > 0) && (
                <section className="report-sec">
                  <h2 className="sec-title">Turning points</h2>
                  <div className="tp-grid">
                    {d.highlights.map((h) => (
                      <div key={h.label} className={`tp ${h.tone}`}>
                        <span className="tp-tone"><span aria-hidden>{TONE_MARK[h.tone]}</span> {TONE_WORD[h.tone]}</span>
                        <span className="tp-label">{h.label}</span>
                        <b className="tp-value">{h.value}</b>
                        <span className="tp-detail">{h.detail}</span>
                      </div>
                    ))}
                  </div>
                  {d.lessons.length > 0 && (
                    <>
                      <h3 className="sub-title">What decided it</h3>
                      <ol className="lesson-cards">
                        {d.lessons.map((l, i) => (
                          <li key={l}><span className="lesson-n" aria-hidden>{String(i + 1).padStart(2, "0")}</span><span>{l}</span></li>
                        ))}
                      </ol>
                    </>
                  )}
                </section>
              )}

              <section className="report-sec report-cols">
                <div>
                  <h2 className="sec-title">Crew</h2>
                  <dl className="crew-stats">
                    {view.crew.map((c) => (
                      <div key={c.role} className={c.role === view.you ? "you" : ""}><dt>{ROLE_TITLE[c.role]}{c.role === view.you ? " · you" : ""}</dt><dd>{c.callsign}</dd></div>
                    ))}
                    <div><dt>Time</dt><dd>{fmt(o.durationMs)}</dd></div>
                    <div><dt>Reached</dt><dd>{survived ? "Escaped" : `Act ${ROMAN[reachedAct]}`}</dd></div>
                    <div><dt>Mistakes</dt><dd>{o.mistakes}</dd></div>
                    {d && <div><dt>Events logged</dt><dd>{d.events.length}</dd></div>}
                  </dl>
                  {acts.length > 1 && (
                    <dl className="act-split">
                      {acts.map(({ act, t }, i) => (
                        <div key={act}><dt>{ROMAN[act]} · {ACT_TITLE[act]}</dt><dd>{clock((acts[i + 1]?.t ?? o.durationMs) - t)}</dd></div>
                      ))}
                    </dl>
                  )}
                </div>
                <div className="progress">
                  <h2 className="sec-title">Next voyage</h2>
                  <p className="prog-title">{prog.title}</p>
                  <ul>
                    {prog.lines.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              </section>
            </>
          )}

          <footer className="report-actions">
            <div className="action-row">
              <button className="primary big" data-testid="sail-again" onClick={() => send({ t: "sailAgain" })}>
                Sail again together
              </button>
              <button className="secondary" data-testid="same-ship" onClick={() => send({ t: "sailAgain", sameShip: true })}>
                Same ship again
              </button>
              <a className="secondary" href={`/log/${view.code}/`}>Debrief page</a>
            </div>
            <p className="hint">
              <b>Sail again</b>: same crew and roles, a new ship with new faults. <b>Same ship</b>: the same faults, to put what you learned straight to use. Your partner comes too.
            </p>
            <p className="report-links">
              <a href="/history/">Ship's Log</a> · <button className="link" onClick={onHome}>Back to port</button>
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}
