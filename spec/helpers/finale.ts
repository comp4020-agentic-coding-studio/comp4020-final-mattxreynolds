// What a Wheelhouse Player who can only read the Clue text would settle on:
// dial levels that put the instrument inside its target, using the rules the
// text gives and never stored data. Handles both finales (#48, #64).
export interface Settings {
  valves: number[];
  trims: number[];
}

const nums = (m: RegExpMatchArray | null, what: string): number[] => {
  if (!m) throw new Error(`the Clue does not say ${what}`);
  return m.slice(1).map(Number);
};

function helmSettings(text: string): Settings {
  const [current] = nums(text.match(/pushes the heading (\d+) degrees/), "the current");
  const [knots] = nums(text.match(/ship makes (\d+) knots/), "knots per stop");
  const [sMin, sMax] = nums(text.match(/telegraph runs (-?\d+) to (-?\d+)/), "the telegraph range");
  const [hMin, hMax] = nums(text.match(/helm runs (-?\d+) to (-?\d+)/), "the helm range");
  const [heading] = nums(text.match(/Heading target: (-?\d+)/), "the heading");
  const [speedLo, speedHi] = nums(text.match(/Speed target: (-?\d+) to (-?\d+) knots/), "the speed");
  for (let stop = sMin; stop <= sMax; stop++) {
    if (knots * stop < speedLo || knots * stop > speedHi) continue;
    for (let helm = hMin; helm <= hMax; helm++) if (helm + current * stop === heading) return { valves: [stop], trims: [helm] };
  }
  throw new Error("no setting reaches the targets");
}

export function settingsFromClue(text: string): Settings {
  if (/telegraph/i.test(text)) return helmSettings(text);
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
