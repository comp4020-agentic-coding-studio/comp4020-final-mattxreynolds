export function Controls() {
  return (
    <dl className="controls">
      <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Move</dd>
      <dt>Mouse</dt><dd>Look</dd>
      <dt><kbd>E</kbd> / click</dt><dd>Use what's under the crosshair (hold for hold-controls)</dd>
      <dt><kbd>Shift</kbd></dt><dd>Walk faster</dd>
      <dt><kbd>Esc</kbd></dt><dd>Free the mouse / pause</dd>
      <dt><kbd>M</kbd></dt><dd>Mute</dd>
    </dl>
  );
}
