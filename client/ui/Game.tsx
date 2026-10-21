// The in-voyage screen: 3D scene + HUD + briefing/pause card.

import { useEffect, useRef, useState } from "react";
import { MODE_RULES } from "../../shared/config.ts";
import { PHASE_OBJECTIVE, ROLE_ROOM, ROLE_TITLE, type Phase } from "../../shared/protocol.ts";
import { Scene } from "../scene/Scene.tsx";
import { useStore } from "../store.ts";
import { CinematicOverlay } from "./CinematicOverlay.tsx";
import { Controls } from "./Controls.tsx";
import { PHASE_GUIDE } from "./guide.ts";

/** How long the "where to look" banner stays up after a phase starts. */
const PHASE_BANNER_MS = 5500;

/** Shows the phase guide for a few seconds the first time the player is in
 * the room (pointer locked) during each phase, so a phase that changes while
 * they're on the briefing card still gets its banner when they return. */
function usePhaseBanner(phase: Phase, locked: boolean): Phase | null {
  const [shown, setShown] = useState<Phase | null>(null);
  const seen = useRef<Phase | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!locked || seen.current === phase || !PHASE_GUIDE[phase]) return;
    seen.current = phase;
    setShown(phase);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), PHASE_BANNER_MS);
  }, [phase, locked]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return shown === phase ? shown : null;
}

const PHASE_LABEL: Record<string, string> = {
  PROLOGUE: "ACT I · IMPACT",
  POWER: "ACT I · EMERGENCY POWER",
  FLOOD: "ACT II · STABILISATION",
  RADIO: "ACT III · MAYDAY",
  CASCADE: "ACT IV · CASCADE",
  ESCAPE: "ACT V · ABANDON SHIP",
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
  const volume = useStore((s) => s.volume);
  const sceneReady = useStore((s) => s.sceneReady);
  const cinematic = useStore((s) => s.cinematic);
  const [gl] = useState(webglAvailable);
  const bannerPhase = usePhaseBanner(view.phase, locked);
  const takeRef = useRef<HTMLButtonElement>(null);
  // keyboard players: Enter/Space on the card takes the controls
  useEffect(() => {
    if (sceneReady && !locked) takeRef.current?.focus();
  }, [sceneReady, locked]);

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
  const partnerRoom = partner ? ROLE_ROOM[partner.role] : "other room";
  const guide = PHASE_GUIDE[view.phase]?.[view.you];
  const banner = bannerPhase ? PHASE_GUIDE[bannerPhase]?.[view.you] : undefined;
  const lockCanvas = () => {
    if (!useStore.getState().sceneReady) return;
    const canvas = document.querySelector<HTMLCanvasElement>("#scene canvas");
    try {
      // some browsers return a promise that rejects (e.g. right after Esc)
      void (canvas?.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* the briefing card stays up; the player can click again */
    }
  };

  if (cinematic) {
    return (
      <div className="game">
        <Scene />
        <CinematicOverlay />
      </div>
    );
  }

  return (
    <div className="game">
      <Scene />
      {!ended && (
        <>
          <div className="hud-top">
            <div className="phase">
              <span className="phase-name">
                {PHASE_LABEL[view.phase]}
                {view.practice && <span className="tag practice" data-testid="practice-tag">PRACTICE</span>}
                {view.mode !== "STANDARD" && <span className="tag mode">{MODE_RULES[view.mode].title.toUpperCase()}</span>}
              </span>
              <span className="objective" data-testid="objective">{PHASE_OBJECTIVE[view.phase][view.you]}</span>
              <ShipStrip />
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
          {banner && locked && (
            <div className="phase-banner" role="status" key={bannerPhase}>
              <p className="phase-banner-title">{banner.title}</p>
              <p><b>You:</b> {banner.you}</p>
              <p><b>{partner?.callsign ?? "Partner"}</b> in the {partnerRoom} {banner.partner}</p>
            </div>
          )}
          {muted && <div className="muted-tag">MUTED (M)</div>}
          {!locked && (
            <div className="overlay" onClick={(e) => e.target === e.currentTarget && lockCanvas()}>
              <div className="card briefing">
                <p className="kicker">{ROLE_ROOM[view.you]} · Voyage {view.code}</p>
                <h1>{ROLE_TITLE[view.you]}</h1>
                <p className="apart">
                  <b>{partner?.callsign ?? "Your partner"}</b> is in the {partnerRoom}. <b>Neither of you can see the other's room</b>, and your
                  controls change each other's rooms. Say what you see, out loud.
                </p>
                <p className="objective-big">{PHASE_OBJECTIVE[view.phase][view.you]}</p>
                {guide && (
                  <ul className="guide">
                    <li><b>You:</b> {guide.you}</li>
                    <li><b>{partner?.callsign ?? "Your partner"}</b> in the {partnerRoom} {guide.partner}</li>
                  </ul>
                )}
                <Controls />
                {sceneReady ? (
                  <button ref={takeRef} className="primary big" data-testid="take-controls" onClick={lockCanvas}>
                    Click to take the controls
                  </button>
                ) : (
                  <button className="primary big" disabled aria-busy="true">
                    Lighting the lamps…
                  </button>
                )}
                <p className="hint">Or click anywhere outside this card. Esc frees the mouse and brings this card back. Stuck? Press R here to return to your starting point.</p>
                <label className="volume">
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => useStore.setState({ volume: Number(e.target.value), muted: false })}
                  />
                  <button className="link" onClick={() => useStore.setState((s) => ({ muted: !s.muted }))}>
                    {muted ? "Unmute" : "Mute"}
                  </button>
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A compact strip of the ship-wide systems both seats may see: grid state,
 * evac charge, davits, lost compartments, coast-station calls. Text and
 * symbols, never colour alone. */
function ShipStrip() {
  const phase = useStore((s) => s.view?.phase);
  const ship = useStore((s) => s.view?.ship);
  if (!ship || !phase || !["FLOOD", "RADIO", "CASCADE", "ESCAPE"].includes(phase)) return null;
  const lost = Object.entries(ship.lost).filter(([, l]) => l).map(([c]) => c);
  return (
    <div className="ship-strip" data-testid="ship-strip">
      <span className={ship.gridDown ? "bad" : ""}>{ship.gridDown ? "⚠ GRID DOWN" : "GRID ✓"}</span>
      {(phase === "CASCADE" || phase === "ESCAPE") && (
        <span>
          EVAC {Math.round(ship.evac)}%{ship.evacOnline ? " ▲" : ""}
        </span>
      )}
      {phase === "ESCAPE" && <span className={ship.armed ? "" : "bad"}>{ship.armed ? "DAVITS ARMED ✓" : "DAVITS NOT ARMED"}</span>}
      {ship.calling && <span className="bad blink">☎ COAST STATION CALLING</span>}
      {lost.length > 0 && <span className="bad">LOST: {lost.join(", ")}</span>}
    </div>
  );
}
