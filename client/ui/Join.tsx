import { useEffect, useState, type FormEvent } from "react";
import { CALLSIGN_MAX } from "../../shared/config.ts";
import { ROLE_TITLE, type Role } from "../../shared/protocol.ts";
import { joinVoyage, peekVoyage, type Peek } from "../net.ts";
import { callsignError } from "./Home.tsx";

const JOIN_ERROR: Record<string, string> = {
  "not-found": "There's no voyage with that code. Check it with your partner.",
  full: "This voyage already has two crew. Start your own voyage instead.",
  ended: "This voyage has already ended. Start a new one.",
  "bad-callsign": "That callsign won't work. Use letters and numbers.",
  network: "Can't reach the ship's server. Check your connection.",
};

export function Join({
  code,
  initialError,
  onSeated,
  onHome,
}: {
  code: string;
  initialError: string | null;
  onSeated: () => void;
  onHome: () => void;
}) {
  const [peek, setPeek] = useState<Peek | null | "loading">("loading");
  const [callsign, setCallsign] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    peekVoyage(code).then(setPeek);
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = callsignError(callsign);
    if (err) return setError(err);
    setBusy(true);
    const r = await joinVoyage(code, callsign);
    setBusy(false);
    if ("error" in r) setError(JOIN_ERROR[r.error] ?? "Couldn't join.");
    else onSeated();
  };

  if (peek === "loading") return <div className="card center"><p className="loading">Looking up voyage {code}…</p></div>;

  const full = peek && peek.crew.length >= 2;
  const unavailable = !peek || full || peek.phase === "SURVIVED" || peek.phase === "LOST";

  return (
    <div className="card center join">
      <p className="kicker">Voyage</p>
      <h1 className="code">{code}</h1>
      {!peek ? (
        <p className="error" role="alert">{JOIN_ERROR["not-found"]}</p>
      ) : full ? (
        <p className="error" role="alert">{JOIN_ERROR.full}</p>
      ) : unavailable ? (
        <p className="error" role="alert">{JOIN_ERROR.ended}</p>
      ) : (
        <form onSubmit={submit}>
          <p>
            {peek.crew.map((c) => (
              <span key={c.role}>
                <b>{c.callsign}</b> is aboard as {ROLE_TITLE[c.role as Role]}.{" "}
              </span>
            ))}
            You'll join as <b>Radio Officer / Navigator</b> on the Bridge.
          </p>
          <label>
            Your callsign
            <input
              name="callsign"
              autoFocus
              value={callsign}
              maxLength={CALLSIGN_MAX}
              placeholder="e.g. LIN"
              onChange={(e) => setCallsign(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>{busy ? "Boarding…" : "Board the ship"}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
      <p><button className="link" onClick={onHome}>← Back to port</button></p>
    </div>
  );
}
