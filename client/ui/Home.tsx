import { useState, type FormEvent } from "react";
import { CALLSIGN_MAX } from "../../shared/config.ts";
import { createVoyage } from "../net.ts";
import { Controls } from "./Controls.tsx";

export const callsignError = (s: string): string | null =>
  !s.trim() ? "Enter a callsign" : !/^[A-Za-z0-9 _.'-]+$/.test(s) ? "Letters, numbers, spaces and - _ . ' only" : null;

export function Home({ onVoyage }: { onVoyage: (code: string) => void }) {
  const [callsign, setCallsign] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const err = callsignError(callsign);
    if (err) return setError(err);
    setBusy(true);
    const r = await createVoyage(callsign);
    setBusy(false);
    if ("error" in r) setError(r.error === "network" ? "Can't reach the ship's server. Check your connection." : "That callsign won't work.");
    else onVoyage(r.code);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) return setError("Voyage codes are 4 characters, like K7M2.");
    onVoyage(c);
  };

  return (
    <div className="home">
      <header className="hero">
        <p className="kicker">A two-player cooperative escape</p>
        <h1>Below the Waterline</h1>
        <p className="lede">
          A collision has holed your ship. The <b>Engineer</b> is sealed in the Engine Room; the{" "}
          <b>Radio Officer</b> is trapped on the Bridge. Each of you sees things the other can't, and your controls
          change each other's rooms. Talk it through, keep her afloat, and get off together.
        </p>
        <p className="need">
          <span aria-hidden>🎧</span> Needs <b>two players</b> in separate browsers, <b>talking</b> by voice call or in
          the same room. There is no in-game chat. That's the point. About 10–15 minutes.
        </p>
      </header>

      <div className="panels">
        <form className="card" onSubmit={create} aria-labelledby="create-h">
          <h2 id="create-h">Start a voyage</h2>
          <label>
            Your callsign
            <input
              name="callsign"
              autoFocus
              value={callsign}
              maxLength={CALLSIGN_MAX}
              autoComplete="nickname"
              placeholder="e.g. ADA"
              onChange={(e) => setCallsign(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Launching…" : "Create voyage"}
          </button>
          <p className="hint">You'll be the Engineer and get a code to send your partner.</p>
        </form>

        <form className="card" onSubmit={join} aria-labelledby="join-h">
          <h2 id="join-h">Join a voyage</h2>
          <label>
            Voyage code
            <input
              name="code"
              value={joinCode}
              maxLength={4}
              placeholder="K7M2"
              autoCapitalize="characters"
              className="code-input"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
          </label>
          <button className="primary">Join</button>
          <p className="hint">Or just open the link your partner sent you.</p>
        </form>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card how">
        <h2>How to play</h2>
        <ol>
          <li>One player creates a voyage and shares the code or link.</li>
          <li>The other joins from <b>their own browser</b> (a different profile or incognito window works on one computer).</li>
          <li>Both press <b>Ready</b>. Get on a call. Describe what you see; don't assume your partner sees it too.</li>
        </ol>
        <Controls />
      </section>

      <footer className="links">
        <a href="/history/">Ship's Log</a> · <a href="/readme/">README</a>
      </footer>
    </div>
  );
}
