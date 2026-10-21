// Simple XZ collision: each room declares its walkable bounds and solid boxes.
// The player is a circle; we resolve against boxes axis by axis.

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
export type RoomLayout = { bounds: Box; solids: Box[]; spawn: [number, number, number]; spawnYaw: number };

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

/** Moves from (x, z) by (dx, dz), sliding along walls and solids. */
export function moveWithCollision(layout: RoomLayout, x: number, z: number, dx: number, dz: number): [number, number] {
  const r = PLAYER_RADIUS;
  const b = layout.bounds;
  const clampX = (v: number) => Math.max(b.minX + r, Math.min(b.maxX - r, v));
  const clampZ = (v: number) => Math.max(b.minZ + r, Math.min(b.maxZ - r, v));
  let nx = clampX(x + dx);
  if (layout.solids.some((s) => hits(nx, z, s, r))) nx = x;
  let nz = clampZ(z + dz);
  if (layout.solids.some((s) => hits(nx, nz, s, r))) nz = z;
  return [nx, nz];
}
