import type { Slot } from "../../shared/draw.ts";
import { muralKeypadV1 } from "./mural-keypad/v1.ts";
import { leverOrderV1 } from "./lever-order/v1.ts";
import { rottenFloorV1 } from "./rotten-floor/v1.ts";
import { helmTelegraphV1 } from "./helm-telegraph/v1.ts";
import { valvesGaugesV1 } from "./valves-gauges/v1.ts";
import type { PuzzleVersion } from "./types.ts";

// The Puzzle registry, keyed "id@v" (ADR 0001, ADR 0007). To add a Puzzle:
// write server/puzzles/<id>/v<n>.ts exporting one PuzzleVersion, and list it
// here. Never remove a version an unfinished Voyage may still reference.
// The `any` is only this list's element type: callers get a PuzzleVersion<unknown>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VERSIONS: PuzzleVersion<any>[] = [muralKeypadV1, leverOrderV1, rottenFloorV1, valvesGaugesV1, helmTelegraphV1];

const registry = new Map<string, PuzzleVersion>(VERSIONS.map((v) => [v.key, v]));

export function puzzle(key: string): PuzzleVersion {
  const found = registry.get(key);
  if (!found) throw new Error(`unknown Puzzle version ${key}`);
  return found;
}

/**
 * Every Puzzle a slot's fresh Draws may pick from: the newest version of each
 * id (an older version stays registered only for Voyages already drawn). The
 * Draw picks one at random (server/draw.ts).
 */
export function versionsFor(slot: Slot): PuzzleVersion[] {
  const newest = new Map<string, PuzzleVersion>();
  for (const v of VERSIONS) if (v.slot === slot) newest.set(v.key.split("@")[0], v);
  return [...newest.values()];
}
