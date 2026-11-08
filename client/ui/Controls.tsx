// The controls card on the home page, the lobby and the briefing card. It
// lists the controls for the input the player is using: touch on a phone or
// tablet, keyboard and mouse otherwise (store.touch, scene/touch.ts).

import { useStore } from "../store.ts";

export function Controls() {
  const touch = useStore((s) => s.touch);
  return touch ? <TouchList /> : <KeyList />;
}

function KeyList() {
  return (
    <dl className="controls" data-testid="controls-keys">
      <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Move</dd>
      <dt>Mouse</dt><dd>Look</dd>
      <dt><kbd>E</kbd> / click</dt><dd>Use what's under the crosshair (hold for hold-controls)</dd>
      <dt><kbd>Shift</kbd></dt><dd>Walk faster</dd>
      <dt><kbd>Esc</kbd></dt><dd>Free the mouse / pause</dd>
      <dt><kbd>M</kbd></dt><dd>Mute</dd>
    </dl>
  );
}

function TouchList() {
  return (
    <dl className="controls touch" data-testid="controls-touch">
      <dt><span className="chip">Left thumb</span></dt><dd>Drag to walk: the stick appears where you touch</dd>
      <dt><span className="chip">Right thumb</span></dt><dd>Drag to look around</dd>
      <dt><span className="chip">Tap a control</span></dt><dd>Use it (switches, levers, buttons)</dd>
      <dt><span className="chip round">USE</span></dt><dd>Use what's under the reticle ◎. Keep your finger down on a hold-control</dd>
      <dt><span className="chip round">❚❚</span></dt><dd>Pause, settings, return to start</dd>
      <dd className="controls-note">Play in landscape. You still need a voice call with your partner.</dd>
    </dl>
  );
}
