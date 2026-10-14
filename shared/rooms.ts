// Room data and its box-collision check (ADR 0006, ADR 0007; tickets #8, #17,
// #33). A pure module: the client builds the greybox scene from it and a spec
// checks it, with no three.js and no DOM in here.
//
// A Room declares geometry, what blocks walking (including areas a Puzzle
// opens later) and the usable things. It never declares a cue field: nothing
// marks a thing as usable (#33).
import type { InstrumentView, Slot } from "./draw.ts";
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

/** What pressing a finale control does: one notch on one dial of the finale's split instrument (#55). */
export interface Control {
  kind: "turn-valve" | "turn-trim";
  index: number;
  by: 1 | -1;
}

/** A read-out on the east wall: this Deck's half of the instrument. It is never pressed (#55). */
export interface Display {
  id: string;
  show: "valve" | "gauge" | "hold";
  index: number;
  x: number;
  y: number;
  z: number;
  /** Drawn width, height, depth in metres. */
  size: [number, number, number];
}

export interface Thing {
  id: string;
  /** A Puzzle station works only while its Puzzle is live; a decoy examines to a plaque. */
  kind: "station" | "decoy";
  slot?: Slot;
  /** Only worth reaching once this Puzzle has opened the way. */
  behind?: Slot;
  plaque?: string;
  /** A station that turns one dial of the finale while that Puzzle is live. */
  control?: Control;
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
  /** The finale's read-outs. */
  displays: Display[];
  /** Walkable floor, facing the east wall, from which every finale control and read-out is in reach and 44 px or more at 390x844. */
  finaleStand: Stance;
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

const WALL = 7.9; // the east wall plates sit on
const PLATE = 0.1;
const BUTTON = 0.4; // a control is 0.4 m square: 44 px or more out to 1.9 m, at 390x844
const ROW_Y = [2.25, 1.8, 1.35]; // clear of the joystick at the bottom left of a phone
const STAND_Z = 4.8;

function dialControls(kind: Control["kind"], prefix: string, offset: number): Thing[] {
  return [0, 1, 2].flatMap((index) =>
    ([-1, 1] as const).map((by): Thing => ({
      id: `${prefix}-${index}-${by < 0 ? "down" : "up"}`,
      kind: "station",
      slot: "finale",
      control: { kind, index, by },
      x: WALL,
      y: ROW_Y[index],
      z: STAND_Z + by * offset,
      size: [PLATE, BUTTON, BUTTON],
    })),
  );
}

const display = (id: string, show: Display["show"], index: number, y: number, width: number, height = 0.4): Display => ({
  id, show, index, x: WALL, y, z: STAND_Z, size: [PLATE, height, width],
});

const FINALE_STAND: Stance = { x: 6.2, z: STAND_Z, yaw: -Math.PI / 2 };

const WHEELHOUSE: Room = {
  ...COMMON,
  name: "Wheelhouse",
  deck: "Upper Deck",
  start: { x: 2, z: 5.5, yaw: 0 },
  blockers: [{ id: "helm", box: { minX: 3.2, maxX: 4.8, minZ: 2.8, maxZ: 3.6 }, height: 1.2 }, ...alcove("w")],
  things: [
    { id: "mural", kind: "station", slot: "opener", x: 2, y: 1.6, z: 0.1, size: [2.4, 1.6, 0.1] },
    { id: "chart-table", kind: "station", slot: "middle", x: 1, y: 1, z: 4.2, size: [1, 1, 1.6] },
    ...dialControls("turn-trim", "trim", 0.9),
    { id: "brass-barometer", kind: "decoy", plaque: "A brass barometer. It reads STORMY.", x: 0.1, y: 1.7, z: 2.5, size: [0.1, 0.4, 0.4] },
    { id: "chart-locker", kind: "decoy", behind: "opener", plaque: "A chart locker, empty but for salt.", x: 7.5, y: 0.6, z: 0.5, size: [0.8, 1.2, 0.8] },
  ],
  displays: [
    display("gauge-0", "gauge", 0, ROW_Y[0], 1.0),
    display("gauge-1", "gauge", 1, ROW_Y[1], 1.0),
    display("gauge-2", "gauge", 2, ROW_Y[2], 1.0),
    display("hold", "hold", 0, 2.65, 1.6, 0.35),
  ],
  finaleStand: FINALE_STAND,
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
    ...dialControls("turn-valve", "valve", 0.6),
    { id: "coal-crate", kind: "decoy", plaque: "A crate of coal, stencilled GLASGOW.", x: 6.5, y: 0.4, z: 6.4, size: [1, 0.8, 0.8] },
    { id: "spare-parts", kind: "decoy", behind: "opener", plaque: "Spare pistons, greased and wrapped.", x: 7.5, y: 0.5, z: 0.5, size: [0.8, 1, 0.8] },
  ],
  displays: [
    display("valve-0", "valve", 0, ROW_Y[0], 0.6),
    display("valve-1", "valve", 1, ROW_Y[1], 0.6),
    display("valve-2", "valve", 2, ROW_Y[2], 0.6),
  ],
  finaleStand: FINALE_STAND,
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

/**
 * How big a plate looks on screen, in CSS px, from where the Player stands
 * (#18: controls and standing spots are sized together for 44 px at 390x844).
 * It mirrors the scene's camera: horizontal view held near 75 degrees, the
 * vertical one capped at 100. The plate is measured at its centre.
 */
export function projectedSize(
  _room: Room,
  me: Stance,
  thing: Pick<Thing, "x" | "z" | "size">,
  view: { width: number; height: number },
): { width: number; height: number } {
  const fovY = Math.min(2 * Math.atan(Math.tan((75 * Math.PI) / 360) / (view.width / view.height)), (100 * Math.PI) / 180);
  const focal = view.height / 2 / Math.tan(fovY / 2);
  const dx = thing.x - me.x;
  const dz = thing.z - me.z;
  const ahead = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw);
  const [sx, sy, sz] = thing.size;
  const across = Math.abs(sx * Math.cos(me.yaw)) + Math.abs(sz * Math.sin(me.yaw));
  return { width: (across * focal) / ahead, height: (sy * focal) / ahead };
}

/** The words a read-out shows: Wheelhouse gauges with their trims and the hold, Engine Room valve levels. `sinceMs` is how old the view is. */
export function displayText(d: Display, view: InstrumentView | null, sinceMs = 0, launched = false): string {
  if (launched) return d.show === "hold" ? "Lifeboat away" : "Launched";
  if (!view) return "";
  if (d.show === "valve") return String(view.valves?.[d.index] ?? "");
  if (d.show === "gauge") return view.readings && view.trims ? `${view.readings[d.index]}  trim ${view.trims[d.index]}` : "";
  if (view.holdMs == null) return "Out of band";
  return `In band ${Math.floor(Math.min(10_000, view.holdMs + sinceMs) / 1000)} s of 10`;
}
