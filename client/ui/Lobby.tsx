import { useState } from "react";
import { ROLE_ROOM, ROLE_TITLE, ROLES } from "../../shared/protocol.ts";
import { send } from "../net.ts";
import { useStore } from "../store.ts";

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
                    {c.callsign} {role === view.you && <span className="tag">YOU</span>}
                  </p>
                  <p className="blurb">{ROLE_BLURB[role]}</p>
                  <p className={`ready ${c.ready ? "yes" : "no"}`}>{c.ready ? "✓ READY" : "Not ready"}</p>
                </>
              ) : (
                <p className="waiting">Waiting for crew…</p>
              )}
            </div>
          );
        })}
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
