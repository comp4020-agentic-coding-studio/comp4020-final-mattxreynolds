// Letterbox, captions and Skip for the cinematic bookends. The voyage itself
// never waits on this: the prologue doesn't take on water, and the endings
// are already decided. Space / Enter / Esc or the button skips.

import { useEffect, useState } from "react";
import { CAPTIONS, cinematicTime, SHOT_SECONDS } from "../scene/Cinematic.tsx";
import { useStore } from "../store.ts";

export function CinematicOverlay() {
  const cin = useStore((s) => s.cinematic);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!cin) return;
    const id = setInterval(() => {
      const t = cinematicTime(cin.start);
      setNow(t);
      if (t > SHOT_SECONDS[cin.shot]) useStore.setState({ cinematic: null });
    }, 200);
    const skip = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
        e.preventDefault();
        useStore.setState({ cinematic: null });
      }
    };
    addEventListener("keydown", skip);
    return () => {
      clearInterval(id);
      removeEventListener("keydown", skip);
    };
  }, [cin]);
  if (!cin) return null;
  const t = now;
  const caps = CAPTIONS[cin.shot].filter((c) => t >= c.at && t < c.until);
  return (
    <div className="cinematic" data-testid="cinematic" role="dialog" aria-label="Cinematic">
      <div className="bar top" />
      <div className="bar bottom" />
      <div className="captions" aria-live="polite">
        {caps.map((c) => (
          <p key={c.text} className={c.big ? "big" : ""}>{c.text}</p>
        ))}
      </div>
      <button className="skip" data-testid="skip-cinematic" autoFocus onClick={() => useStore.setState({ cinematic: null })}>
        Skip ▸▸ <kbd>Space</kbd>
      </button>
    </div>
  );
}
