// Routing: "/" = home, "/v/CODE" = a voyage (join screen if this browser has
// no seat for it, otherwise lobby / game / ending).

import { useEffect, useState } from "react";
import { isPlaying } from "../../shared/protocol.ts";
import { connect, disconnect, forgetToken, savedToken } from "../net.ts";
import { useStore } from "../store.ts";
import { exposeTestApi } from "../testApi.ts";
import { Ending } from "./Ending.tsx";
import { Game } from "./Game.tsx";
import { Home } from "./Home.tsx";
import { Join } from "./Join.tsx";
import { Lobby } from "./Lobby.tsx";
import { Toasts } from "./Toasts.tsx";

function codeFromPath(): string | null {
  const m = location.pathname.match(/^\/v\/([A-Za-z0-9]{3,8})\/?$/);
  return m ? m[1].toUpperCase() : null;
}

export function App() {
  const [code, setCode] = useState<string | null>(codeFromPath);
  const [seated, setSeated] = useState<boolean>(() => (code ? Boolean(savedToken(code)) : false));
  const [error, setError] = useState<string | null>(null);
  const view = useStore((s) => s.view);
  const conn = useStore((s) => s.conn);
  const cinematic = useStore((s) => s.cinematic);

  useEffect(() => {
    exposeTestApi();
    const onPop = () => {
      const c = codeFromPath();
      setCode(c);
      setSeated(c ? Boolean(savedToken(c)) : false);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!code || !seated) return;
    connect(code, (reason) => {
      // stale or foreign token: forget it and offer the join screen
      forgetToken(code);
      setSeated(false);
      setError(reason === "not-found" ? "That voyage doesn't exist." : null);
    });
  }, [code, seated]);

  // follow server-side moves (sail again) into the URL state
  useEffect(() => {
    if (view && code && view.code !== code) setCode(view.code);
  }, [view, code]);

  const go = (next: string | null) => {
    history.pushState(null, "", next ? `/v/${next}` : "/");
    if (!next) disconnect();
    setError(null);
    setCode(next);
    setSeated(next ? Boolean(savedToken(next)) : false);
  };

  let body;
  if (!code) body = <Home onVoyage={go} />;
  else if (!seated) body = <Join code={code} initialError={error} onSeated={() => setSeated(true)} onHome={() => go(null)} />;
  else if (!view) body = <div className="card center"><p className="loading">{conn === "offline" ? "Reconnecting to the ship…" : "Boarding…"}</p></div>;
  else if (view.phase === "LOBBY") body = <Lobby onHome={() => go(null)} />;
  else if (isPlaying(view.phase)) body = <Game />;
  else body = (
    <>
      <Game ended />
      {!cinematic && <Ending onHome={() => go(null)} />}
    </>
  );

  return (
    <>
      {body}
      <Toasts />
    </>
  );
}
