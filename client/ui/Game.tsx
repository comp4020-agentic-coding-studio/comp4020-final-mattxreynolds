// The in-voyage screen: 3D scene + HUD + briefing/pause card.

import { useEffect, useState } from "react";
import { PHASE_OBJECTIVE, ROLE_ROOM, ROLE_TITLE } from "../../shared/protocol.ts";
import { Scene } from "../scene/Scene.tsx";
import { useStore } from "../store.ts";
import { Controls } from "./Controls.tsx";

const PHASE_LABEL: Record<string, string> = {
  PROLOGUE: "PROLOGUE",
  POWER: "1 · EMERGENCY POWER",
  FLOOD: "2 · FLOOD CONTROL",
  RADIO: "3 · DISTRESS SIGNAL",
  ESCAPE: "FINAL · ABANDON SHIP",
  SURVIVED: "SURVIVED",
  LOST: "LOST",
};

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Game({ ended = false }: { ended?: boolean }) {
  const view = useStore((s) => s.view)!;
  const locked = useStore((s) => s.locked);
  const prompt = useStore((s) => s.prompt);
  const conn = useStore((s) => s.conn);
  const muted = useStore((s) => s.muted);
  const [gl] = useState(webglAvailable);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !(e.target instanceof HTMLInputElement)) useStore.setState((s) => ({ muted: !s.muted }));
      if (e.code === "KeyR" && !useStore.getState().locked) useStore.setState((s) => ({ respawn: s.respawn + 1 }));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (ended && document.pointerLockElement) document.exitPointerLock();
  }, [ended]);

  if (!gl) {
    return (
      <div className="card center">
        <h1>3D isn't available</h1>
        <p>This browser can't start WebGL, which the ship's rooms need. Try a current Chrome, Edge or Firefox with hardware acceleration enabled.</p>
      </div>
    );
  }

  const partner = view.crew.find((c) => c.role !== view.you);
  const lockCanvas = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#scene canvas");
    canvas?.requestPointerLock?.();
  };

  return (
    <div className="game">
      <Scene />
      {!ended && (
        <>
          <div className="hud-top">
            <div className="phase">
              <span className="phase-name">{PHASE_LABEL[view.phase]}</span>
              <span className="objective" data-testid="objective">{PHASE_OBJECTIVE[view.phase][view.you]}</span>
            </div>
            <div className={`flood ${view.trend.toLowerCase()}`} data-testid="flood">
              FLOODING: {view.trend}
              <span className="meter" aria-hidden><span style={{ width: `${view.danger}%` }} /></span>
            </div>
          </div>
          <div className="reticle" aria-hidden>{prompt ? "◎" : "·"}</div>
          {prompt && locked && <div className="prompt">{prompt}</div>}
          {(conn !== "online" || view.paused || (partner && !partner.connected)) && (
            <div className="banner warn" role="status">
              {conn !== "online"
                ? "Connection lost — reconnecting…"
                : `${partner?.callsign ?? "Partner"} lost connection — ship systems holding`}
            </div>
          )}
          {muted && <div className="muted-tag">MUTED (M)</div>}
          {!locked && (
            <div className="overlay">
              <div className="card briefing">
                <p className="kicker">{ROLE_ROOM[view.you]} · Voyage {view.code}</p>
                <h1>{ROLE_TITLE[view.you]}</h1>
                <p className="objective-big">{PHASE_OBJECTIVE[view.phase][view.you]}</p>
                <p>
                  Your partner <b>{partner?.callsign}</b> is in the {partner ? ROLE_ROOM[partner.role] : "other room"}. You can't see each
                  other's rooms. Describe everything.
                </p>
                <Controls />
                <button className="primary big" data-testid="take-controls" onClick={lockCanvas}>
                  Click to take the controls
                </button>
                <p className="hint">Esc frees the mouse. Stuck? Press R here to return to your starting point.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
