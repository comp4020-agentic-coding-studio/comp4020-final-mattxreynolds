import { useEffect, useState } from "react";
import { usePlayer } from "./api.ts";
import { Lobby } from "./Lobby.tsx";
import { Room } from "./Room.tsx";

// Two screens: the lobby at / and a room at /room/CODE. The server answers
// every path with this page, so a room link can be shared and reloaded.
export function navigate(to: string): void {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const { me, rename } = usePlayer();
  const code = path.match(/^\/room\/([A-Za-z0-9]{4})\/?$/)?.[1]?.toUpperCase() ?? null;

  return (
    <>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          DEAD<span> AIR</span>
          <small>COOPERATIVE DEFUSAL</small>
        </a>
        <div className="topmeta">
          {code ? (
            <>
              ROOM {code} <span className="divider">/</span>
            </>
          ) : null}
          CALLSIGN <strong className="callsign">{me?.callsign ?? "······"}</strong>
        </div>
        {code ? (
          <button className="quiet" onClick={() => navigate("/")}>
            Leave room
          </button>
        ) : (
          <a className="quiet" href="/readme/">
            Read me
          </a>
        )}
      </header>
      <main>
        {code ? <Room key={code} code={code} me={me} /> : <Lobby me={me} rename={rename} />}
        <footer>
          <span>01 / DEAD AIR</span>
          <span>
            <a href="/readme/">README</a> · two seats · one device · every run logged
          </span>
          <span>HEADPHONES OPTIONAL. TALKING ESSENTIAL.</span>
        </footer>
      </main>
    </>
  );
}
