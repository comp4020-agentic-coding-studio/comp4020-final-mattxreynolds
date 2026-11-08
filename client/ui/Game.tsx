// The in-voyage screen: 3D scene + HUD + briefing/pause card.

import { useEffect, useRef, useState } from "react";
import { setQuality } from "../scene/look/quality.ts";
import { resetTouch, release } from "../scene/input.ts";
import { touchPrompt } from "../scene/touch.ts";
import { MODE_RULES } from "../../shared/config.ts";
import { PHASE_OBJECTIVE, ROLE_ROOM, ROLE_TITLE, type Phase } from "../../shared/protocol.ts";
import { Scene } from "../scene/Scene.tsx";
import { useStore } from "../store.ts";
import { CinematicOverlay } from "./CinematicOverlay.tsx";
import { Controls } from "./Controls.tsx";
import { PHASE_GUIDE } from "./guide.ts";
import { TouchControls } from "./TouchControls.tsx";

/** How long the "where to look" banner stays up after a phase starts. */
const PHASE_BANNER_MS = 5500;

/** Shows the phase guide for a few seconds the first time the player is in
 * the room (on the controls) during each phase, so a phase that changes while
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

/** A big stencilled act card on each phase change: ~2.5 s, skippable, never blocks input. */
const ACT_CARD_MS = 2500;
function ActCard({ phase }: { phase: Phase }) {
  const [shown, setShown] = useState<Phase | null>(null);
  const last = useRef<Phase | null>(null);
  useEffect(() => {
    if (last.current === phase) return;
    last.current = phase;
    if (!/^ACT /.test(PHASE_LABEL[phase] ?? "")) return setShown(null);
    setShown(phase);
    const t = setTimeout(() => setShown(null), ACT_CARD_MS);
    return () => clearTimeout(t);
  }, [phase]);
  if (!shown) return null;
  const [act, name] = PHASE_LABEL[shown]!.split(" · ");
  return (
    <div className="act-card" data-testid="act-card" key={shown} aria-hidden>
      <span className="act-num">{act}</span>
      <span className="act-name">{name}</span>
      <button className="act-skip" tabIndex={-1} onClick={() => setShown(null)}>skip</button>
    </div>
  );
}

const TREND_MARK: Record<string, string> = { STABLE: "▬ HOLDING", RISING: "▲ RISING", CRITICAL: "✖ CRITICAL", FALLING: "▼ FALLING" };

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
  const quality = useStore((s) => s.quality);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const sceneReady = useStore((s) => s.sceneReady);
  const cinematic = useStore((s) => s.cinematic);
  const touch = useStore((s) => s.touch);
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
    if (!ended) return;
    if (document.pointerLockElement) document.exitPointerLock();
    // touch play has no lock to lose: leave the controls explicitly, so the
    // next voyage starts on the briefing card like a mouse player's does
    resetTouch();
    useStore.setState({ locked: false });
  }, [ended]);
  // leaving the controls (pause, Esc) drops any touch stick, look or hold
  useEffect(() => {
    if (!locked) resetTouch();
  }, [locked]);

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
    if (useStore.getState().touch) {
      // touch play: no pointer lock; the on-screen controls take over
      release();
      useStore.setState({ locked: true });
      return;
    }
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
      <div className={touch ? "game touch" : "game"}>
        <Scene />
        <CinematicOverlay />
      </div>
    );
  }

  return (
    <div className={touch ? "game touch" : "game"}>
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
              <span className="flood-pct">{Math.round(view.danger)}%</span>
              <span className="flood-label">SHIP DANGER · {TREND_MARK[view.trend] ?? view.trend}</span>
              <span className="meter" aria-hidden>
                <span style={{ width: `${view.danger}%` }} />
                <i style={{ left: "25%" }} /><i style={{ left: "50%" }} /><i style={{ left: "75%" }} />
              </span>
            </div>
          </div>
          <div className="reticle" aria-hidden>{prompt ? "◎" : "·"}</div>
          {prompt && locked && <div className={touch ? "prompt touch" : "prompt"}>{touch ? touchPrompt(prompt) : prompt}</div>}
          {touch && locked && <TouchControls />}
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
          <ActCard phase={view.phase} />
          {muted && !(touch && locked) && <div className="muted-tag">{touch ? "MUTED" : "MUTED (M)"}</div>}
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
                    {touch ? "Tap to take the controls" : "Click to take the controls"}
                  </button>
                ) : (
                  <button className="primary big" disabled aria-busy="true">
                    Lighting the lamps…
                  </button>
                )}
                {touch ? (
                  <>
                    <p className="hint">
                      The <b>❚❚ Pause</b> button brings this card back.
                      <span className="portrait-hint"> Turn your device sideways for a wider view.</span>
                    </p>
                    <p className="hint">
                      Stuck?{" "}
                      <button className="link" data-testid="touch-respawn" onClick={() => useStore.setState((s) => ({ respawn: s.respawn + 1 }))}>
                        Return to your starting point
                      </button>
                    </p>
                  </>
                ) : (
                  <p className="hint">Or click anywhere outside this card. Esc frees the mouse and brings this card back. Stuck? Press R here to return to your starting point.</p>
                )}
                <div className="toggles">
                  {touch && <FullscreenToggle />}
                  <button className="link" data-testid="gfx-toggle" onClick={() => setQuality(quality === "high" ? "low" : "high")}>
                    Graphics: {quality === "high" ? "High" : "Low"}
                  </button>
                  <button className="link" data-testid="motion-toggle" onClick={() => useStore.setState((s) => ({ reducedMotion: !s.reducedMotion }))}>
                    Reduced motion: {reducedMotion ? "On" : "Off"}
                  </button>
                </div>
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

/** Full screen for touch play: on a phone the browser's own bars take a
 * large share of the view. Hidden where the page can't go full screen
 * (iPhone Safari). */
function FullscreenToggle() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const flip = () => {
    const done = full ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" });
    void done?.catch?.(() => {});
  };
  return (
    <button className="link" data-testid="fullscreen-toggle" onClick={flip}>
      Full screen: {full ? "On" : "Off"}
    </button>
  );
}
