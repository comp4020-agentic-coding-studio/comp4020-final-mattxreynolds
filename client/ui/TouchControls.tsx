// On-screen controls for touch play (ADR 008), shown while a touch player is
// on the controls. Left part of the screen: a floating move stick wherever
// the thumb lands. Right part: drag to look. Anywhere, a tap on a control in
// the view uses it, and a finger held still on a hold-control holds it. The USE button
// uses whatever is under the reticle (hold it for hold-controls). Pause brings
// the briefing card back.
//
// Every gesture writes scene/input.ts directly (and the knob's transform) —
// no React state per move event, so the HUD never re-renders while you walk.

import { useEffect, useRef } from "react";
import { input, isHoldOnly, press, release, resetTouch } from "../scene/input.ts";
import { fingerPoints, isTap, stickVector, TOUCH } from "../scene/touch.ts";
import { useStore } from "../store.ts";

/** One finger on the view. Every finger can tap or hold the control it
 * landed on; it also either drives the move stick (left part of the screen)
 * or turns the view (right part) once it moves. */
type Finger = {
  id: number;
  stick: boolean;
  /** where it touched down, where it was last, when, and the furthest it has strayed */
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  at: number;
  moved: number;
  /** the control under the finger when it touched down, if any */
  target: string | null;
  held: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

export function TouchControls() {
  const layer = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const prompt = useStore((s) => s.prompt);
  const muted = useStore((s) => s.muted);

  useEffect(() => {
    const el = layer.current!;
    const fingers = new Map<number, Finger>();
    const ndc = (x: number, y: number): [number, number] => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];
    /** The control under a fingertip: the exact point, else the ring around it. */
    const pickUnder = (x: number, y: number): string | null => {
      for (const [px, py] of fingerPoints(x, y)) {
        const id = input.pick?.(...ndc(px, py));
        if (id) return id;
      }
      return null;
    };

    const drawStick = (f: Finger | null, kx = 0, ky = 0) => {
      const b = base.current;
      const k = knob.current;
      if (!b || !k) return;
      b.classList.toggle("active", Boolean(f));
      // the stick floats to where the thumb landed; at rest it sits in its corner
      b.style.left = f ? `${f.sx}px` : "";
      b.style.top = f ? `${f.sy}px` : "";
      k.style.transform = `translate(${kx}px, ${ky}px)`;
    };

    const endFinger = (f: Finger, lifted: boolean) => {
      fingers.delete(f.id);
      clearTimeout(f.timer);
      if (f.stick) {
        input.stick.x = 0;
        input.stick.y = 0;
        drawStick(null);
      }
      if (f.held) release();
      else if (lifted && f.target && isTap(f.moved, performance.now() - f.at)) {
        // a quick tap on a control uses it (a hold-control is pressed and let go)
        if (press(f.target, "tap") && isHoldOnly(f.target)) release();
      }
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const hasStick = [...fingers.values()].some((f) => f.stick);
      const target = pickUnder(e.clientX, e.clientY);
      const f: Finger = {
        id: e.pointerId,
        stick: !hasStick && e.clientX < innerWidth * TOUCH.stickZone,
        sx: e.clientX,
        sy: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        at: performance.now(),
        moved: 0,
        target,
        held: false,
      };
      fingers.set(e.pointerId, f);
      if (f.stick) drawStick(f);
      if (target && isHoldOnly(target)) {
        // a still finger on a hold-control holds it until lifted
        f.timer = setTimeout(() => {
          if (fingers.get(f.id) === f && f.moved < TOUCH.tapSlopPx && press(target, "tap")) f.held = true;
        }, TOUCH.holdDelayMs);
      }
    };

    const move = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId);
      if (!f) return;
      e.preventDefault();
      f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.sx, e.clientY - f.sy));
      if (f.held) return; // holding a control: stand still and keep looking at it
      if (f.stick) {
        // the dead zone also keeps a finger resting on a control from walking
        const v = stickVector(e.clientX - f.sx, e.clientY - f.sy);
        input.stick.x = v.x;
        input.stick.y = v.y;
        drawStick(f, v.knobX, v.knobY);
        return;
      }
      input.look.yaw -= (e.clientX - f.lx) * TOUCH.lookPerPx;
      input.look.pitch -= (e.clientY - f.ly) * TOUCH.lookPerPx;
      f.lx = e.clientX;
      f.ly = e.clientY;
    };

    const up = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId);
      if (f) endFinger(f, e.type === "pointerup");
    };

    const drop = () => {
      for (const f of [...fingers.values()]) endFinger(f, false);
      resetTouch();
    };
    const onVisibility = () => document.hidden && drop();

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", drop);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", drop);
      drop();
    };
  }, []);

  const aimed = input.aimed;
  const holdOnly = Boolean(prompt && aimed && isHoldOnly(aimed));
  // pointer handlers, not click: a hold-control must stay held while the
  // thumb stays down, and a click would only arrive on lift
  const usePointer = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.classList.add("down");
      press();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("down");
      release();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("down");
      release();
    },
  };

  return (
    <>
      <div ref={layer} className="touch-layer" data-testid="touch-layer" aria-hidden />
      <div ref={base} className="touch-stick" data-testid="touch-stick" aria-hidden>
        <div ref={knob} className="touch-knob" />
        <span>MOVE</span>
      </div>
      {!prompt && <p className="touch-look-hint" aria-hidden>DRAG TO LOOK · TAP A CONTROL</p>}
      <button
        className={`touch-use${prompt ? " ready" : ""}`}
        data-testid="touch-use"
        aria-label={prompt ? `Use: ${prompt}` : "Use (nothing under the reticle)"}
        aria-disabled={!prompt}
        {...usePointer}
        onContextMenu={(e) => e.preventDefault()}
      >
        <b>{holdOnly ? "HOLD" : "USE"}</b>
        <small>{prompt ? "in reach" : "aim ◎"}</small>
      </button>
      <div className="touch-side">
        <button className="touch-small" data-testid="touch-pause" aria-label="Pause and show the briefing card" onClick={() => useStore.setState({ locked: false })}>
          ❚❚<small>PAUSE</small>
        </button>
        <button className="touch-small" data-testid="touch-mute" aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={() => useStore.setState((s) => ({ muted: !s.muted }))}>
          {muted ? "🔇" : "🔊"}
          <small>{muted ? "MUTED" : "SOUND"}</small>
        </button>
      </div>
    </>
  );
}
