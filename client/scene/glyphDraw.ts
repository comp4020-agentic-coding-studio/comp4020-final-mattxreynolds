// The shared glyph vocabulary. Both rooms draw glyphs with exactly these
// paths, so "the anchor" looks the same to both players. Shapes are distinct
// silhouettes: never rely on colour to tell them apart.

import type { Glyph } from "../../shared/glyphs.ts";

/** Draws `glyph` centred at (cx, cy) fitting a box of `size`, using the
 * context's current strokeStyle/fillStyle. */
export function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number, size: number): void {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (glyph) {
    case "anchor":
      ctx.arc(0, -36, 10, 0, Math.PI * 2);
      ctx.moveTo(0, -26);
      ctx.lineTo(0, 40);
      ctx.moveTo(-22, -12);
      ctx.lineTo(22, -12);
      ctx.moveTo(-38, 14);
      ctx.quadraticCurveTo(-30, 44, 0, 42);
      ctx.quadraticCurveTo(30, 44, 38, 14);
      ctx.stroke();
      break;
    case "gear": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
        ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.moveTo(11, 0);
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "bolt":
      ctx.moveTo(10, -46);
      ctx.lineTo(-24, 6);
      ctx.lineTo(2, 6);
      ctx.lineTo(-10, 46);
      ctx.lineTo(26, -8);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      break;
    case "wave":
      for (const y of [-18, 6, 30]) {
        ctx.moveTo(-42, y);
        ctx.bezierCurveTo(-28, y - 18, -14, y - 18, 0, y);
        ctx.bezierCurveTo(14, y + 18, 28, y + 18, 42, y);
      }
      ctx.stroke();
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 46 : 19;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "crescent":
      ctx.arc(0, 0, 42, Math.PI * 0.25, Math.PI * 1.75, false);
      ctx.arc(16, 0, 32, Math.PI * 1.6, Math.PI * 0.4, true);
      ctx.closePath();
      ctx.fill();
      break;
    case "trident":
      ctx.moveTo(0, 46);
      ctx.lineTo(0, -40);
      ctx.moveTo(-30, -40);
      ctx.lineTo(-30, -6);
      ctx.quadraticCurveTo(-30, 10, 0, 10);
      ctx.quadraticCurveTo(30, 10, 30, -6);
      ctx.lineTo(30, -40);
      ctx.moveTo(-36, -30);
      ctx.lineTo(-30, -46);
      ctx.lineTo(-24, -30);
      ctx.moveTo(-6, -30);
      ctx.lineTo(0, -46);
      ctx.lineTo(6, -30);
      ctx.moveTo(24, -30);
      ctx.lineTo(30, -46);
      ctx.lineTo(36, -30);
      ctx.stroke();
      break;
    case "bell":
      ctx.moveTo(-34, 26);
      ctx.quadraticCurveTo(-30, 18, -26, -10);
      ctx.quadraticCurveTo(-22, -40, 0, -40);
      ctx.quadraticCurveTo(22, -40, 26, -10);
      ctx.quadraticCurveTo(30, 18, 34, 26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 36, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.lineTo(0, -48);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
