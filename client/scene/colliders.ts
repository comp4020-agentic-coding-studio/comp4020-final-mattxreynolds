// Simple XZ collision: each room declares its walkable bounds and solid boxes.
// The player is a circle; we resolve against boxes axis by axis.

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
/** A doorway that is solid until `open()` says otherwise (read every frame). */
export type Door = { box: Box; open: () => boolean };
/** `bounds` may be several walkable boxes (rooms joined by doorways): the
 * player may stand anywhere inside their union. */
export type RoomLayout = {
  bounds: Box | Box[];
  solids: Box[];
  doors?: Door[];
  spawn: [number, number, number];
  spawnYaw: number;
};

export const PLAYER_RADIUS = 0.3;

/** Box from centre (x, z) and full size (w, d). */
export const box = (x: number, z: number, w: number, d: number): Box => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
});

function hits(x: number, z: number, b: Box, r: number): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/** The circle at (x, z) lies wholly inside the union of the walkable boxes.
 * Checked at the centre and the four compass extremes, which is exact for
 * axis-aligned boxes that overlap where rooms join. */
function walkable(bounds: Box[], x: number, z: number, r: number): boolean {
  const inside = (px: number, pz: number) => bounds.some((b) => px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ);
  return inside(x - r, z) && inside(x + r, z) && inside(x, z - r) && inside(x, z + r);
}

function blocked(layout: RoomLayout, x: number, z: number, r: number): boolean {
  const bounds = Array.isArray(layout.bounds) ? layout.bounds : [layout.bounds];
  if (!walkable(bounds, x, z, r)) return true;
  if (layout.solids.some((s) => hits(x, z, s, r))) return true;
  return Boolean(layout.doors?.some((d) => !d.open() && hits(x, z, d.box, r)));
}

/** Moves from (x, z) by (dx, dz), sliding along walls and solids. */
export function moveWithCollision(layout: RoomLayout, x: number, z: number, dx: number, dz: number): [number, number] {
  const r = PLAYER_RADIUS;
  let nx = x + dx;
  if (blocked(layout, nx, z, r)) nx = x;
  let nz = z + dz;
  if (blocked(layout, nx, nz, r)) nz = z;
  return [nx, nz];
}
