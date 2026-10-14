// What a Wheelhouse Player who can only read the Clue text would settle on:
// valve levels and trims that put every gauge inside its target, using the
// rule the text gives and never stored data.
export interface Settings {
  valves: number[];
  trims: number[];
}

export function settingsFromClue(text: string): Settings {
  const step = Number(text.match(/valve step moves its gauge by (\d+)/)![1]);
  const [vMin, vMax] = text.match(/valves run (-?\d+) to (-?\d+)/)!.slice(1).map(Number);
  const [tMin, tMax] = text.match(/trims run (-?\d+) to (-?\d+)/)!.slice(1).map(Number);
  const targets = [...text.matchAll(/Gauge \d: target (-?\d+) to (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const settings: Settings = { valves: [], trims: [] };
  for (const [lo, hi] of targets) {
    const options: [number, number][] = [];
    for (let v = vMin; v <= vMax; v++) for (let t = tMin; t <= tMax; t++) if (step * v + t >= lo && step * v + t <= hi) options.push([v, t]);
    if (options.length === 0) throw new Error(`no setting reaches ${lo} to ${hi}`);
    settings.valves.push(options[0][0]);
    settings.trims.push(options[0][1]);
  }
  return settings;
}
