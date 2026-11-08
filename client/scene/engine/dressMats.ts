// Extra materials for the machinery-space dressing and light fittings
// (module singletons; the lit ones are driven per frame by Lighting.tsx).

import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from "three";
import { PALETTE } from "../palette.ts";

const std = (color: string, roughness = 0.7, metalness = 0.2, extra: Partial<MeshStandardMaterial> = {}) =>
  Object.assign(new MeshStandardMaterial({ color, roughness, metalness }), extra);

function stainTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 9; i++) {
    const x = 64 + (Math.random() - 0.5) * 50;
    const y = 64 + (Math.random() - 0.5) * 50;
    const r = 14 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(8,6,4,0.55)");
    g.addColorStop(0.7, "rgba(10,8,5,0.3)");
    g.addColorStop(1, "rgba(10,8,5,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + Math.random() * 0.4), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft radial contact shadow (alpha only), stretched per object. */
function blobTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.78)");
  g.addColorStop(0.45, "rgba(0,0,0,0.55)");
  g.addColorStop(0.8, "rgba(0,0,0,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** A light-shaft card: narrow and bright at the top (v = 1), widening and
 * fading toward the deck, soft at the sides. Additive, so black = nothing. */
function shaftTexture(): CanvasTexture {
  const w = 64;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 top .. 1 bottom
    const half = 0.22 + t * 0.26; // beam half-width in u
    const vert = Math.min(1, t * 12) * Math.pow(1 - t, 1.6);
    for (let x = 0; x < w; x++) {
      const u = Math.abs(x / (w - 1) - 0.5);
      const side = Math.max(0, 1 - Math.pow(u / half, 2));
      const a = Math.round(255 * vert * side * side);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

let d: ReturnType<typeof make> | null = null;
function make() {
  return {
    lag: std("#a89f86", 0.95, 0),
    lagBand: std("#3c3a33", 0.8, 0.3),
    galv: std("#7d8a8c", 0.45, 0.6),
    rust: std("#6a3b24", 0.9, 0.3),
    oil: std("#0e0d0c", 0.35, 0.2),
    ext: std("#b3241c", 0.4, 0.3),
    jacket: std("#d8651a", 0.9, 0),
    white: std("#d9d6c8", 0.7, 0),
    khaki: std("#6d6a4c", 0.95, 0),
    suit: std("#2c3f5a", 0.95, 0),
    copper: std("#9a5a38", 0.4, 0.8),
    cable: std("#121314", 0.7, 0.1),
    cableRed: std("#7a1c16", 0.7, 0.1),
    wood: std(PALETTE.wood, 0.85, 0),
    paper: std("#d8cfae", 0.9, 0),
    cork: std("#8a6a45", 0.95, 0),
    book: std("#5a1d1a", 0.8, 0),
    ceramic: std("#cfc8b4", 0.3, 0.1),
    yellow: std("#c99d1a", 0.6, 0.2),
    safetyGreen: std("#2a6a3c", 0.6, 0.2),
    tool: std("#8f979a", 0.35, 0.85),
    stain: std("#ffffff", 0.2, 0, {
      map: stainTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
    /** caged bulkhead lamp glass (working circuit): emissive driven by Lighting.tsx */
    lampGlass: std("#3a3226", 0.3, 0, { emissive: new Color("#ffd9a0"), emissiveIntensity: 0 }),
    /** the same, Aux Machinery Room (follows the aux grid, not the LIGHTS circuit) */
    auxLampGlass: std("#3a3226", 0.3, 0, { emissive: new Color("#ffd9a0"), emissiveIntensity: 0 }),
    /** red emergency dome, Aux room (lit when the grid is down) */
    auxEmergGlass: std("#3a1a14", 0.3, 0, { emissive: new Color("#ff2a1a"), emissiveIntensity: 0 }),
    /** fluorescent tubes: unlit, HDR colour set per frame so bloom catches them */
    tube: new MeshBasicMaterial({ color: "#3a3a36", toneMapped: false }),
    /** one tired tube that flickers on its own when the ship is in trouble */
    tubeBad: new MeshBasicMaterial({ color: "#3a3a36", toneMapped: false }),
    /** contact shadow decal under machinery */
    blob: new MeshBasicMaterial({
      color: "#000000",
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      fog: false,
    }),
    /** fake light shafts (high tier only): additive cards, colour = intensity */
    shaft: new MeshBasicMaterial({
      color: "#000000",
      map: shaftTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    }),
    /** moonlit skylight pane */
    sky: std("#1a2630", 0.3, 0, { emissive: new Color("#9fc4e8"), emissiveIntensity: 1.6 }),
    sight: std("#2a2210", 0.3, 0, { emissive: new Color("#ffb040"), emissiveIntensity: 0.9 }),
  };
}
export function D(): NonNullable<typeof d> {
  return (d ??= make());
}
