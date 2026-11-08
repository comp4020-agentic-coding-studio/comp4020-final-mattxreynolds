// Canvas drawing helpers for the Bridge's information displays. Every screen
// shares one look: dark phosphor glass, a header strip, monospace type drawn
// large, and state always spelled out in words or shapes (never colour alone).

import type { Glyph, Pulse } from "../../../shared/glyphs.ts";
import { drawGlyph } from "../glyphDraw.ts";
import { PALETTE } from "../palette.ts";

export const MONO = `ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace`;
export const font = (px: number, weight = "bold"): string => `${weight} ${Math.round(px)}px ${MONO}`;

export const INK = {
  bg: "#06150f",
  bgHi: "#0d2a22",
  grid: "rgba(125,255,178,0.07)",
  ink: PALETTE.screenInk,
  dim: "rgba(125,255,178,0.45)",
  faint: "rgba(125,255,178,0.22)",
  white: "#e9fff2",
  amber: PALETTE.lampAmber,
  red: PALETTE.lampRed,
  green: PALETTE.lampGreen,
  cream: PALETTE.dialFace,
  dark: PALETTE.dialInk,
  water: "#2e8fb0",
  waterHi: "#7fd6f0",
} as const;

export type Ctx = CanvasRenderingContext2D;

/** Screen glass: dark gradient, faint grid and scanlines. */
export function screenBg(ctx: Ctx, w: number, h: number, opts: { grid?: boolean; tint?: string } = {}): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, opts.tint ?? INK.bgHi);
  g.addColorStop(1, INK.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (opts.grid !== false) {
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.round(w / 24);
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }
}

/** Scanlines + vignette, drawn last so content sits "under the glass". */
export function screenGlass(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A powered-down screen: black glass with a faint reflection, no text. */
export function drawDead(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#050707";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(255,255,255,0.05)");
  g.addColorStop(0.35, "rgba(255,255,255,0.0)");
  g.addColorStop(0.6, "rgba(255,255,255,0.025)");
  g.addColorStop(1, "rgba(255,255,255,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Header strip with a title on the left and an optional tag on the right. */
export function header(ctx: Ctx, w: number, title: string, tag?: string, opts: { h?: number; color?: string } = {}): number {
  const hh = opts.h ?? 64;
  ctx.fillStyle = "rgba(125,255,178,0.12)";
  ctx.fillRect(0, 0, w, hh);
  ctx.fillStyle = opts.color ?? INK.ink;
  ctx.fillRect(0, hh - 3, w, 3);
  ctx.font = font(hh * 0.52);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(title, 24, hh / 2 + 1);
  if (tag) {
    ctx.textAlign = "right";
    ctx.fillText(tag, w - 24, hh / 2 + 1);
  }
  return hh;
}

export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  px: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = "bold",
): void {
  ctx.font = font(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

/** Text shrunk to fit `maxW`. */
export function fitText(ctx: Ctx, s: string, x: number, y: number, px: number, maxW: number, color: string, align: CanvasTextAlign = "center"): void {
  let size = px;
  ctx.font = font(size);
  while (size > 10 && ctx.measureText(s).width > maxW) {
    size -= 2;
    ctx.font = font(size);
  }
  text(ctx, s, x, y, size, color, align);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** A full-width banner (e.g. "EMERGENCY POWER ONLINE"). Box + text, never colour alone. */
export function banner(ctx: Ctx, s: string, cx: number, cy: number, bw: number, bh: number, fg: string, bg = "rgba(0,0,0,0.78)"): void {
  roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 12);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = fg;
  ctx.stroke();
  fitText(ctx, s, cx, cy + 2, bh * 0.5, bw - 40, fg);
}

/** Glyph in a cream roundel with a dark ring: the canonical glyph plate. */
export function roundel(ctx: Ctx, glyph: Glyph, cx: number, cy: number, r: number, opts: { ring?: string; bg?: string; ink?: string } = {}): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.bg ?? INK.cream;
  ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.1);
  ctx.strokeStyle = opts.ring ?? INK.ink;
  ctx.stroke();
  ctx.fillStyle = opts.ink ?? INK.dark;
  ctx.strokeStyle = opts.ink ?? INK.dark;
  drawGlyph(ctx, glyph, cx, cy, r * 1.35);
}

/** Lightning-bolt hazard triangle (shape-coded, independent of colour). */
export function hazardMark(ctx: Ctx, cx: number, cy: number, size: number): void {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.lineTo(50, 40);
  ctx.lineTo(-50, 40);
  ctx.closePath();
  ctx.fillStyle = INK.amber;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -24);
  ctx.lineTo(-14, 10);
  ctx.lineTo(0, 10);
  ctx.lineTo(-8, 32);
  ctx.lineTo(14, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.restore();
}

/** Trend arrow: ▲ rising, ▼ falling, ■ steady — shape plus word. */
export function trendMark(ctx: Ctx, trend: -1 | 0 | 1, cx: number, cy: number, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  if (trend > 0) {
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy + s * 0.8);
    ctx.lineTo(cx - s, cy + s * 0.8);
  } else if (trend < 0) {
    ctx.moveTo(cx, cy + s);
    ctx.lineTo(cx + s, cy - s * 0.8);
    ctx.lineTo(cx - s, cy - s * 0.8);
  } else {
    ctx.rect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4);
  }
  ctx.closePath();
  ctx.fillStyle = trend > 0 ? INK.amber : trend < 0 ? INK.green : INK.dim;
  ctx.fill();
}

export const TREND_WORD: Record<-1 | 0 | 1, string> = { 1: "RISING", 0: "STEADY", [-1]: "FALLING" } as Record<-1 | 0 | 1, string>;

/** A pulse pattern as graphics: long = wide bar, short = dot. Returns width used. */
export function pulseDiagram(ctx: Ctx, pattern: Pulse, x: number, cy: number, unit: number, color: string): number {
  ctx.fillStyle = color;
  let cx = x;
  for (const long of pattern) {
    if (long) {
      roundRect(ctx, cx, cy - unit * 0.32, unit * 2.4, unit * 0.64, unit * 0.32);
      ctx.fill();
      cx += unit * 2.4 + unit * 0.7;
    } else {
      ctx.beginPath();
      ctx.arc(cx + unit * 0.4, cy, unit * 0.4, 0, Math.PI * 2);
      ctx.fill();
      cx += unit * 0.8 + unit * 0.7;
    }
  }
  return cx - x;
}

/** Amber/black hazard stripes in a rect. */
export function hazardStripes(ctx: Ctx, x: number, y: number, w: number, h: number, band = 40): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.hazardYellow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.hazardBlack;
  for (let i = -h; i < w + h; i += band * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + band, y + h);
    ctx.lineTo(x + i + band + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** "STANDBY" / "AWAITING POWER" placeholder for a phase not yet reached. */
export function drawStandby(ctx: Ctx, w: number, h: number, title: string, line: string, sub?: string): void {
  screenBg(ctx, w, h, { grid: false, tint: "#0a1914" });
  header(ctx, w, title, "STANDBY", { color: INK.dim, h: Math.max(48, h * 0.1) });
  ctx.globalAlpha = 0.85;
  fitText(ctx, line, w / 2, h * 0.52, Math.min(h * 0.16, 84), w * 0.85, INK.dim);
  if (sub) fitText(ctx, sub, w / 2, h * 0.52 + Math.min(h * 0.16, 84) * 1.1, Math.min(h * 0.07, 36), w * 0.85, INK.faint);
  ctx.globalAlpha = 1;
  screenGlass(ctx, w, h);
}
