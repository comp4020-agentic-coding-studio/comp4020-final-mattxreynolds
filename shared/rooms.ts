// Room data and its box-collision check (ADR 0006, ADR 0007; tickets #8, #17,
// #33). A pure module: the client builds the greybox scene from it and a spec
// checks it, with no three.js and no DOM in here.
//
// A Room declares geometry, what blocks walking (including areas a Puzzle
// opens later) and the usable things. It never declares a cue field: nothing
// marks a thing as usable (#33).
import type { Slot } from "./draw.ts";
import type { DeckName } from "./intents.ts";

/** Floor-plan box in metres: x east, z south, y up. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Blocker {
  id: string;
  box: Box;
  /** Drawn height in metres. */
  height: number;
  /** While this Puzzle is unsolved the box blocks walking; once solved it no longer does. */
  opensWith?: Slot;
}

export interface Thing {
  id: string;
  /** A Puzzle station works only while its Puzzle is live; a decoy examines to a plaque. */
  kind: "station" | "decoy";
  slot?: Slot;
  /** Only worth reaching once this Puzzle has opened the way. */
  behind?: Slot;
  plaque?: string;
  x: number;
  y: number;
  z: number;
  /** Drawn width, height, depth in metres. */
  size: [number, number, number];
}

export interface Room {
  name: "Wheelhouse" | "Engine Room";
  deck: DeckName;
  /** East-west and north-south extent; the floor is 0..width by 0..depth. */
  width: number;
  depth: number;
  wallHeight: number;
  start: { x: number; z: number; yaw: number };
  /** How far from the Player a thing can be used: about 2 m (#17). */
  reach: number;
  /** How close, in screen pixels, a press must land to a thing to hit it; the nearest wins (#18). */
  hitRadiusPx: number;
  /** The Player is a circle on the floor; walls and blockers are padded by this. */
  radius: number;
  eyeHeight: number;
  blockers: Blocker[];
  things: Thing[];
}

const COMMON = { width: 8, depth: 7, wallHeight: 3, reach: 2, hitRadiusPx: 22, radius: 0.3, eyeHeight: 1.6 } as const;

// An alcove in the east of each Room, shut by a hatch that the opener Puzzle opens.
function alcove(prefix: string): Blocker[] {
  return [
    { id: `${prefix}-bulkhead-west`, box: { minX: 5.3, maxX: 5.5, minZ: 0, maxZ: 2.4 }, height: 3 },
    { id: `${prefix}-bulkhead-south-left`, box: { minX: 5.5, maxX: 6.0, minZ: 2.2, maxZ: 2.4 }, height: 3 },
    { id: `${prefix}-bulkhead-south-right`, box: { minX: 7.4, maxX: 8, minZ: 2.2, maxZ: 2.4 }, height: 3 },
    { id: `${prefix}-hatch`, box: { minX: 6.0, maxX: 7.4, minZ: 2.2, maxZ: 2.4 }, height: 3, opensWith: "opener" },
  ];
}

const WHEELHOUSE: Room = {
  ...COMMON,
  name: "Wheelhouse",
  deck: "Upper Deck",
  start: { x: 2, z: 5.5, yaw: 0 },
  blockers: [{ id: "helm", box: { minX: 3.2, maxX: 4.8, minZ: 2.8, maxZ: 3.6 }, height: 1.2 }, ...alcove("w")],
  things: [
    { id: "mural", kind: "station", slot: "opener", x: 2, y: 1.6, z: 0.1, size: [2.4, 1.6, 0.1] },
    { id: "chart-table", kind: "station", slot: "middle", x: 1, y: 1, z: 4.2, size: [1, 1, 1.6] },
    { id: "speaking-tube", kind: "station", slot: "finale", x: 7.9, y: 1.4, z: 5, size: [0.2, 0.2, 0.2] },
    { id: "brass-barometer", kind: "decoy", plaque: "A brass barometer. It reads STORMY.", x: 0.1, y: 1.7, z: 2.5, size: [0.1, 0.4, 0.4] },
    { id: "chart-locker", kind: "decoy", behind: "opener", plaque: "A chart locker, empty but for salt.", x: 7.5, y: 0.6, z: 0.5, size: [0.8, 1.2, 0.8] },
  ],
};

const ENGINE_ROOM: Room = {
  ...COMMON,
  name: "Engine Room",
  deck: "Lower Deck",
  start: { x: 2, z: 5.5, yaw: 0 },
  blockers: [{ id: "boiler", box: { minX: 2.8, maxX: 4.8, minZ: 2.6, maxZ: 3.8 }, height: 2 }, ...alcove("e")],
  things: [
    { id: "keypad", kind: "station", slot: "opener", x: 2, y: 1.4, z: 0.1, size: [0.5, 0.7, 0.1] },
    { id: "valve-bank", kind: "station", slot: "middle", x: 0.1, y: 1.2, z: 4.5, size: [0.2, 1.2, 1.6] },
    { id: "steam-gauges", kind: "station", slot: "finale", x: 7.9, y: 1.5, z: 5, size: [0.2, 0.8, 1.2] },
    { id: "coal-crate", kind: "decoy", plaque: "A crate of coal, stencilled GLASGOW.", x: 6.5, y: 0.4, z: 6.4, size: [1, 0.8, 0.8] },
    { id: "spare-parts", kind: "decoy", behind: "opener", plaque: "Spare pistons, greased and wrapped.", x: 7.5, y: 0.5, z: 0.5, size: [0.8, 1, 0.8] },
  ],
};

export const ROOMS: readonly Room[] = [WHEELHOUSE, ENGINE_ROOM];

export function roomForDeck(deck: DeckName): Room {
  return ROOMS.find((r) => r.deck === deck)!;
}

type Opened = ReadonlySet<Slot>;
const EPS = 1e-9;

/** Boxes that currently block walking, grown by the Player's radius. */
function padded(room: Room, opened: Opened): Box[] {
  const r = room.radius;
  return room.blockers
    .filter((b) => !(b.opensWith && opened.has(b.opensWith)))
    .map(({ box: b }) => ({ minX: b.minX - r, maxX: b.maxX + r, minZ: b.minZ - r, maxZ: b.maxZ + r }));
}

/** Moves the Player's circle by (dx, dz), one axis at a time, stopping at walls and blockers and sliding along them. */
export function moveInRoom(room: Room, opened: Opened, from: { x: number; z: number }, dx: number, dz: number): { x: number; z: number } {
  const r = room.radius;
  const boxes = padded(room, opened);
  let { x, z } = from;

  let nx = Math.min(room.width - r, Math.max(r, x + dx));
  for (const b of boxes) {
    if (z <= b.minZ + EPS || z >= b.maxZ - EPS) continue;
    if (dx > 0 && x <= b.minX + EPS && nx > b.minX) nx = b.minX;
    if (dx < 0 && x >= b.maxX - EPS && nx < b.maxX) nx = b.maxX;
  }
  x = nx;

  let nz = Math.min(room.depth - r, Math.max(r, z + dz));
  for (const b of boxes) {
    if (x <= b.minX + EPS || x >= b.maxX - EPS) continue;
    if (dz > 0 && z <= b.minZ + EPS && nz > b.minZ) nz = b.minZ;
    if (dz < 0 && z >= b.maxZ - EPS && nz < b.maxZ) nz = b.maxZ;
  }
  return { x, z: nz };
}

const CELL = 0.2;

/** Centres of the floor cells a Player can walk to from the start, given which Puzzles have opened their areas. */
export function reachableCells(room: Room, opened: Opened): { x: number; z: number }[] {
  const boxes = padded(room, opened);
  const r = room.radius;
  const free = (x: number, z: number): boolean =>
    x >= r && x <= room.width - r && z >= r && z <= room.depth - r && !boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  const key = (i: number, j: number): string => `${i},${j}`;
  const si = Math.round(room.start.x / CELL);
  const sj = Math.round(room.start.z / CELL);
  const seen = new Set([key(si, sj)]);
  const queue: [number, number][] = [[si, sj]];
  const out: { x: number; z: number }[] = [];
  while (queue.length > 0) {
    const [i, j] = queue.pop()!;
    out.push({ x: i * CELL, z: j * CELL });
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj);
      if (seen.has(k) || !free((i + di) * CELL, (j + dj) * CELL)) continue;
      seen.add(k);
      queue.push([i + di, j + dj]);
    }
  }
  return out;
}

/** A Player's place on the floor and the way they face (yaw 0 looks north, towards -z). */
export interface Stance {
  x: number;
  z: number;
  yaw: number;
}

/** Usable only within the Room's reach and in front of the Player (#17, #52). Nothing marks it as usable (#33). */
export function inReach(room: Room, me: Stance, thing: Pick<Thing, "x" | "z">): boolean {
  const dx = thing.x - me.x;
  const dz = thing.z - me.z;
  const ahead = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw);
  return ahead > 0 && Math.hypot(dx, dz) <= room.reach;
}

/**
 * The thing a press hits: among things in reach, the one nearest the press on
 * screen, if within the hit radius; otherwise null, a miss that does nothing.
 * `pixelsFrom` is the on-screen distance from the press to the thing.
 */
export function pickThing(room: Room, me: Stance, pixelsFrom: (t: Thing) => number): Thing | null {
  let best: Thing | null = null;
  let bestPx = Infinity;
  for (const t of room.things) {
    if (!inReach(room, me, t)) continue;
    const px = pixelsFrom(t);
    if (px <= room.hitRadiusPx && px < bestPx) {
      best = t;
      bestPx = px;
    }
  }
  return best;
}

/**
 * What using a thing shows (#52): a decoy its plaque, a station whose Puzzle is
 * not live yet "rusted solid". A live station points at its Puzzle's controls.
 */
export function examineText(thing: Thing, live: ReadonlySet<Slot>): string {
  if (thing.kind === "decoy") return thing.plaque ?? "Nothing of note.";
  if (thing.slot && live.has(thing.slot)) return "It answers to the controls on your Deck screen.";
  return "Rusted solid.";
}
