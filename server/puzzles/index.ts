import type { Slot } from "../../shared/draw.ts";
import { muralKeypadV1 } from "./mural-keypad/v1.ts";
import { rottenFloorV1 } from "./rotten-floor/v1.ts";
import { helmTelegraphV1 } from "./helm-telegraph/v1.ts";
import { valvesGaugesV1 } from "./valves-gauges/v1.ts";
import type { PuzzleVersion } from "./types.ts";

// The Puzzle registry, keyed "id@v" (ADR 0001, ADR 0007). To add a Puzzle:
// write server/puzzles/<id>/v<n>.ts exporting one PuzzleVersion, and list it
// here. Never remove a version an unfinished Voyage may still reference.
// The `any` is only this list's element type: callers get a PuzzleVersion<unknown>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VERSIONS: PuzzleVersion<any>[] = [muralKeypadV1, rottenFloorV1, valvesGaugesV1, helmTelegraphV1];

const registry = new Map<string, PuzzleVersion>(VERSIONS.map((v) => [v.key, v]));

export function puzzle(key: string): PuzzleVersion {
  const found = registry.get(key);
  if (!found) throw new Error(`unknown Puzzle version ${key}`);
  return found;
}

/** The current version of each Puzzle that fills a slot: a fresh Draw picks one of them at random. */
export function candidatesFor(slot: Slot): PuzzleVersion[] {
  const latest = new Map<string, PuzzleVersion>();
  for (const v of VERSIONS) if (v.slot === slot) latest.set(v.key.split("@")[0], v);
  return [...latest.values()];
}
