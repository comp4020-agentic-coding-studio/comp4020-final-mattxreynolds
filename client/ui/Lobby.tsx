import { useState } from "react";
import { MODE_RULES, MODES } from "../../shared/config.ts";
import { ACT_TITLE, ROLE_ROOM, ROLE_TITLE, ROLES, type Act } from "../../shared/protocol.ts";
import { send } from "../net.ts";
import { useStore } from "../store.ts";
import { Controls } from "./Controls.tsx";

const ROLE_SEES = {
  ENGINEER: { you: "Gauges, valves, breakers, the escape door and the carrier knob.", partner: "Routing diagrams, the flood map, radio logs and charts." },
  NAVIGATOR: { you: "Routing diagrams, the flood map, radio logs and charts.", partner: "Gauges, valves, breakers, the escape door and the carrier knob." },
} as const;

const ROLE_BLURB = {
  ENGINEER: "Hands on the machinery: breakers, valves, the transmitter, the escape door. Reports what the gauges do.",
  NAVIGATOR: "Eyes on the ship: routing diagrams, the flood map, the radio and charts. Interprets and directs.",
} as const;

export function Lobby({ onHome }: { onHome: () => void }) {
  const view = useStore((s) => s.view)!;
  const [copied, setCopied] = useState(false);
  const me = view.crew.find((c) => c.role === view.you);
  const link = `${location.origin}/v/${view.code}`;
  const both = view.crew.length === 2;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="lobby">
      <div className="card center">
        <p className="kicker">Voyage code</p>
        <h1 className="code" data-testid="voyage-code">{view.code}</h1>
        <div className="share">
          <input readOnly value={link} aria-label="Join link" onFocus={(e) => e.target.select()} />
          <button onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
        </div>
        <p className="hint">
          {both ? "Both crew aboard. Get on a voice call, then both press Ready." : "Send this link or code to your partner. They open it in their own browser."}
        </p>
      </div>

      <div className="crew">
        {ROLES.map((role) => {
          const c = view.crew.find((x) => x.role === role);
          return (
            <div key={role} className={`card seat ${role === view.you ? "you" : ""}`} data-role={role}>
              <p className="kicker">{ROLE_ROOM[role]}</p>
              <h2>{ROLE_TITLE[role]}</h2>
              {c ? (
                <>
                  <p className="callsign">
                    <span className={`dot ${c.connected ? "on" : "off"}`} aria-label={c.connected ? "connected" : "disconnected"} />
                    <span className="conn">{c.connected ? "ONLINE" : "OFFLINE"}</span>
                    {c.callsign} {role === view.you && <span className="tag">YOU</span>}
                  </p>
                  <p className="blurb">{ROLE_BLURB[role]}</p>
                  <dl className="sees">
                    <dt>Sees</dt><dd>{ROLE_SEES[role].you}</dd>
                    <dt>Can't see</dt><dd>{ROLE_SEES[role].partner}</dd>
                  </dl>
                  <p className={`ready ${c.ready ? "yes" : "no"}`}>{c.ready ? "✓ READY" : "Not ready"}</p>
                </>
              ) : (
                <p className="waiting">Waiting for crew…</p>
              )}
            </div>
          );
        })}
      </div>

      {view.lobby && <VoyageSettings />}

      <div className="card center">
        <h2>Controls</h2>
        <Controls />
      </div>

      <div className="card center">
        <button
          className="primary big"
          data-testid="ready"
          disabled={!me}
          onClick={() => send({ t: "setReady", ready: !me?.ready })}
        >
          {me?.ready ? "Not ready" : "Ready"}
        </button>
        <p className="hint">The voyage starts when both crew are ready.</p>
        <p><button className="link" onClick={onHome}>← Leave</button></p>
      </div>
    </div>
  );
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** Mode and starting act. Either seat may change them; any change un-readies
 * both, so nobody starts on terms they didn't agree to. */
function VoyageSettings() {
  const lobby = useStore((s) => s.view?.lobby)!;
  const practice = lobby.practice;
  return (
    <div className="card settings" data-testid="settings">
      <h2>Voyage</h2>
      <div className="choices" role="radiogroup" aria-label="Starting point">
        {([1, 2, 3, 4, 5] as Act[]).map((a) => {
          const open = a <= lobby.unlockedActs;
          const on = (practice ?? 1) === a;
          return (
            <button
              key={a}
              role="radio"
              aria-checked={on}
              className={`choice ${on ? "on" : ""}`}
              disabled={!open}
              data-testid={`start-act-${a}`}
              onClick={() => send({ t: "setStart", act: a })}
              title={open ? undefined : "Reach this act on a full voyage to practise it"}
            >
              <b>{a === 1 ? "FULL VOYAGE" : `PRACTICE · ACT ${ROMAN[a]}`}</b>
              <span>{a === 1 ? "From the collision. The only way to a real escape." : ACT_TITLE[a]}</span>
              {!open && <span className="lock">🔒 locked</span>}
            </button>
          );
        })}
      </div>
      {practice && (
        <p className="hint practice-note">
          <b>Practice</b> starts at Act {ROMAN[practice]} with the earlier acts set up as a clean crew would leave them. It is
          logged as practice and never counts as surviving the voyage.
        </p>
      )}
      <div className="choices modes" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => {
          const open = lobby.unlockedModes.includes(m);
          const on = lobby.mode === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              className={`choice ${on ? "on" : ""}`}
              disabled={!open}
              data-testid={`mode-${m}`}
              onClick={() => send({ t: "setMode", mode: m })}
            >
              <b>{MODE_RULES[m].title}</b>
              <span>{open ? MODE_RULES[m].blurb : m === "NIGHTMARE" ? "Survive two challenge modes to unlock." : "Survive a Standard Voyage to unlock."}</span>
              {!open && <span className="lock">🔒 locked</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
