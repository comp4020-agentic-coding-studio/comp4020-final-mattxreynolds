// Procedural surface maps shared by every room (docs/VISUAL_DIRECTION.md):
// painted-steel normal/roughness with chipped edges and streaked grime,
// diamond tread plate, and a generic grime overlay. Generated once on
// canvases (no downloaded textures), cached as module singletons, and
// applied with `dressStd(material, kind)` so existing kit materials pick up
// relief without new geometry.

import { useStore } from "../../store.ts";
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector2, type MeshStandardMaterial, type Texture } from "three";

type Draw = (ctx: CanvasRenderingContext2D, S: number) => void;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(S: number, draw: Draw, srgb: boolean): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  draw(c.getContext("2d")!, S);
  const t = new CanvasTexture(c);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Height field → tangent-space normal map (Sobel). */
function heightToNormal(h: Float32Array, S: number, strength: number): ImageData {
  const out = new ImageData(S, S);
  const at = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 255;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

/** Smooth tileable value noise (cheap; 256² at most). */
function noiseField(S: number, cells: number, rnd: () => number): Float32Array {
  const g = new Float32Array(cells * cells).map(() => rnd());
  const f = new Float32Array(S * S);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cells;
      const fy = (y / S) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = sm(fx - x0);
      const ty = sm(fy - y0);
      const v = (xx: number, yy: number) => g[(yy % cells) * cells + (xx % cells)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
      f[y * S + x] = a + (b - a) * ty;
    }
  }
  return f;
}

function fbm(S: number, rnd: () => number): Float32Array {
  const out = new Float32Array(S * S);
  let amp = 0.5;
  for (const cells of [4, 8, 16, 32]) {
    const n = noiseField(S, cells, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= 0.5;
  }
  return out;
}

// ------------------------------------------------------------ painted steel

const PAINT = 256;
let paintCache: { normal: Texture; rough: Texture } | null = null;

/** Painted steel: orange-peel paint, weld seams, chip pits, drip streaks. */
function paintedSteel(): { normal: Texture; rough: Texture } {
  if (paintCache) return paintCache;
  const S = PAINT;
  const rnd = seeded(41);
  const base = fbm(S, rnd);
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) {
    h[i] = base[i] * 0.25;
    rough[i] = 0.62 + (base[i] - 0.5) * 0.25;
  }
  // chipped paint: small pits with bare (smoother, lower) metal
  for (let k = 0; k < 90; k++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = 1 + rnd() * 3.5;
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const d = Math.hypot(x, y);
        if (d > r) continue;
        const i = (((Math.floor(cy) + y + S) % S) * S + ((Math.floor(cx) + x + S) % S)) | 0;
        h[i] -= 0.5 * (1 - d / r);
        rough[i] = 0.4;
      }
    }
  }
  // vertical drip streaks (rougher)
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(rnd() * S);
    const y0 = Math.floor(rnd() * S);
    const len = 20 + rnd() * 90;
    for (let y = 0; y < len; y++) rough[((y0 + y) % S) * S + x] = Math.min(1, rough[((y0 + y) % S) * S + x] + 0.2 * (1 - y / len));
  }
  const normal = canvas(
    S,
    (ctx) => ctx.putImageData(heightToNormal(h, S, 3), 0, 0),
    false,
  );
  const r = canvas(
    S,
    (ctx) => {
      const img = ctx.createImageData(S, S);
      for (let i = 0; i < rough.length; i++) {
        const v = Math.max(0, Math.min(255, rough[i] * 255));
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    false,
  );
  paintCache = { normal, rough: r };
  return paintCache;
}

// ------------------------------------------------------------ tread plate

let treadCache: { normal: Texture; rough: Texture } | null = null;

/** Diamond tread plate (one tile = 32 lugs), scuffed smooth on the lugs. */
function treadPlate(): { normal: Texture; rough: Texture } {
  if (treadCache) return treadCache;
  const S = 256;
  const rnd = seeded(7);
  const n = fbm(S, rnd);
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const P = 32;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const row = Math.floor(y / P);
      const lx = ((x + (row % 2) * (P / 2)) % P) - P / 2;
      const ly = (y % P) - P / 2;
      const flip = (Math.floor((x + (row % 2) * (P / 2)) / P) + row) % 2 ? 1 : -1;
      // rotated elongated lug
      const u = (lx + flip * ly) * 0.7071;
      const v = (lx - flip * ly) * 0.7071;
      const lug = Math.max(0, 1 - Math.hypot(u / 11, v / 2.6));
      const i = y * S + x;
      h[i] = Math.min(1, lug * 2.2) * 0.6 + n[i] * 0.12;
      rough[i] = lug > 0.1 ? 0.35 + n[i] * 0.2 : 0.75 + n[i] * 0.2;
    }
  }
  treadCache = {
    normal: canvas(S, (ctx) => ctx.putImageData(heightToNormal(h, S, 6), 0, 0), false),
    rough: canvas(
      S,
      (ctx) => {
        const img = ctx.createImageData(S, S);
        for (let i = 0; i < rough.length; i++) {
          const v = Math.max(0, Math.min(255, rough[i] * 255));
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      },
      false,
    ),
  };
  return treadCache;
}

// ------------------------------------------------------------ grime colour overlay

let grimeCache: Texture | null = null;
/** A tileable sRGB grime/rust colour map: multiply-friendly (mostly white). */
export function grimeMap(): Texture {
  if (grimeCache) return grimeCache;
  const S = 256;
  const rnd = seeded(99);
  const n = fbm(S, rnd);
  grimeCache = canvas(
    S,
    (ctx) => {
      const img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          // darker toward the bottom of the tile (water line / boot scuffs)
          const g = Math.max(0, n[i] - 0.45) * 1.6 + (y / S) ** 3 * 0.25;
          const rust = Math.max(0, n[i] - 0.68) * 2.5;
          img.data[i * 4] = 255 * (1 - g * 0.55) - rust * 10;
          img.data[i * 4 + 1] = 255 * (1 - g * 0.6) - rust * 50;
          img.data[i * 4 + 2] = 255 * (1 - g * 0.65) - rust * 80;
          img.data[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    true,
  );
  return grimeCache;
}

// ------------------------------------------------------------ apply

let tier: boolean | null = null;
/** Decided once, when the first material is dressed (before any room mounts). */
function lowTier(): boolean {
  return (tier ??= useStore.getState().quality === "low");
}

export type SurfaceKind = "paint" | "tread" | "metal";

/**
 * Give an existing MeshStandardMaterial procedural relief. `repeat` is in
 * tiles across the material's UV space (match the colour map's repeat).
 * Mutates and returns the material; call once per material at creation.
 */
export function dressStd(mat: MeshStandardMaterial, kind: SurfaceKind, repeat: [number, number] = [1, 1], strength = 1): MeshStandardMaterial {
  // kits are imported by node unit tests (no DOM): leave the material plain.
  // On the low tier (software GL) relief maps cost long shader links for
  // detail nobody sees at that resolution: leave plain too.
  if (typeof document === "undefined" || lowTier()) return mat;
  const src = kind === "tread" ? treadPlate() : paintedSteel();
  const normal = src.normal.clone();
  const rough = src.rough.clone();
  for (const t of [normal, rough]) {
    t.repeat.set(...repeat);
    t.needsUpdate = true;
  }
  mat.normalMap = normal;
  mat.normalScale = new Vector2(strength, strength);
  if (kind !== "metal") {
    mat.roughnessMap = rough;
    mat.roughness = 1;
  }
  mat.needsUpdate = true;
  return mat;
}
