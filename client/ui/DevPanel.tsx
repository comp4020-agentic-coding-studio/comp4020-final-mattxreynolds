// Dev mode panel (docs/DEV_MODE.md). Rendered only when this browser holds
// both seats of a dev voyage, which only a server with /api/dev/* can grant.
// Backquote toggles it; F2 switches seat even with the pointer locked.

import { useEffect, useState } from "react";
import { ROLE_TITLE, isPlaying } from "../../shared/protocol.ts";
import { devAction, devSendPartner, devSwitch, send } from "../net.ts";
import { useStore } from "../store.ts";

export function DevPanel() {
  const dev = useStore((s) => s.dev);
  const phase = useStore((s) => s.view?.phase);
  const you = useStore((s) => s.view?.you);
  const danger = useStore((s) => s.view?.danger ?? 0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Backquote") setOpen((o) => !o);
      if (e.code === "F2") {
        e.preventDefault();
        devSwitch();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  if (!dev || !phase || !you) return null;
  if (!open) return <div className="dev-tab" aria-hidden>DEV ` </div>;
  const playing = isPlaying(phase);

  const readyBoth = async () => {
    await send({ t: "setReady", ready: true });
    await devSendPartner({ t: "setReady", ready: true });
  };

  return (
    <aside className="dev-panel" data-testid="dev-panel" aria-label="Developer tools">
      <p className="dev-title">DEV · {phase}</p>
      <p className="dev-seat">
        Seat: <b>{ROLE_TITLE[you]}</b>
      </p>
      <button data-testid="dev-switch" onClick={devSwitch}>
        Switch to {ROLE_TITLE[dev.partner]} <kbd>F2</kbd>
      </button>
      {phase === "LOBBY" && (
        <button data-testid="dev-ready" onClick={readyBoth}>
          Ready both seats
        </button>
      )}
      {playing && (
        <>
          <button data-testid="dev-skip" onClick={() => devAction({ k: "skip" })}>
            Skip {phase} ⏭
          </button>
          <label className="dev-danger">
            Danger {Math.round(danger)}%
            <input
              type="range"
              min={0}
              max={99}
              step={1}
              defaultValue={Math.round(danger)}
              key={phase}
              onChange={(e) => devAction({ k: "danger", value: Number(e.target.value) })}
            />
          </label>
          <button data-testid="dev-lose" onClick={() => devAction({ k: "lose" })}>
            Sink the ship ✖
          </button>
        </>
      )}
      <p className="dev-hint">
        <kbd>`</kbd> hide · Esc frees the mouse
      </p>
    </aside>
  );
}
