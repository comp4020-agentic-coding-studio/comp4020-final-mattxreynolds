// Canvas-drawn textures for labels, dials and displays. A hook that redraws
// only when its `deps` change, reusing one canvas and texture.

import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

export function useCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
): CanvasTexture {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, [width, height]);

  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, texture, ...deps]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** A flat plate with text, for stencilled labels. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  opts: { bg?: string; fg?: string; font?: string; border?: string } = {},
): void {
  ctx.fillStyle = opts.bg ?? "#1d2328";
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = Math.max(4, h * 0.06);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  ctx.fillStyle = opts.fg ?? "#efe6cf";
  ctx.font = opts.font ?? `bold ${Math.floor(h * 0.5)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  const lh = h / (lines.length + 0.6);
  lines.forEach((line, i) => ctx.fillText(line, w / 2, lh * (i + 0.8)));
}
