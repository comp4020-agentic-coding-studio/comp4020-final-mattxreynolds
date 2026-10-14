// What the plan holder can read aloud and the Walker act on: the plan's text
// turned into the compass steps that cross it, never touching stored data.
export type Dir = "north" | "south" | "east" | "west";
export const DIRS: Dir[] = ["north", "south", "east", "west"];
const STEP: Record<Dir, [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };

export interface PlanGrid {
  safe: Set<string>;
  start: [number, number];
  width: number;
  height: number;
}

export function parsePlan(text: string): PlanGrid {
  const safe = new Set<string>();
  let width = 0;
  let height = 0;
  for (const m of text.matchAll(/^Row (\d+): ([SX ]+)$/gm)) {
    const row = Number(m[1]) - 1;
    const cells = m[2].trim().split(" ");
    width = cells.length;
    height = Math.max(height, row + 1);
    cells.forEach((c, col) => c === "S" && safe.add(`${col},${row}`));
  }
  const start = text.match(/Start on ([A-Z])(\d+)/)!;
  return { safe, start: [start[1].charCodeAt(0) - 65, Number(start[2]) - 1], width, height };
}

/** Every simple path over safe tiles from the start to the far row, as lists of steps. */
export function routes(plan: PlanGrid): Dir[][] {
  const found: Dir[][] = [];
  const walk = (at: [number, number], seen: Set<string>, steps: Dir[]): void => {
    if (at[1] === plan.height - 1) return void found.push(steps);
    for (const dir of DIRS) {
      const next: [number, number] = [at[0] + STEP[dir][0], at[1] + STEP[dir][1]];
      const key = `${next[0]},${next[1]}`;
      if (plan.safe.has(key) && !seen.has(key)) walk(next, new Set([...seen, key]), [...steps, dir]);
    }
  };
  walk(plan.start, new Set([`${plan.start[0]},${plan.start[1]}`]), []);
  return found;
}
