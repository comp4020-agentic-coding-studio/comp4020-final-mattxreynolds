// Render quality tier. "high" = bloom + grade + IBL + full dpr; "low" =
// no post-processing, lower dpr. Starts from a stored preference (per
// browser), otherwise "high", and steps down automatically if the frame
// rate stays poor (scene/look/PostFX.tsx). A per-viewer convenience only:
// nothing authoritative depends on it.

import { useStore } from "../../store.ts";

export type Quality = "high" | "low";
const KEY = "btw.quality";

export function storedQuality(): Quality {
  try {
    const q = localStorage.getItem(KEY);
    if (q === "high" || q === "low") return q;
  } catch {
    /* storage blocked */
  }
  return softwareGL() ? "low" : "high";
}

/** True on CPU rasterisers (SwiftShader, llvmpipe): no GPU, so the bloom
 * pass and full dpr cost more than they add. Probed once on a scratch canvas. */
export function softwareGL(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(r);
  } catch {
    return false;
  }
}

export function setQuality(q: Quality, remember = true): void {
  useStore.setState({ quality: q });
  if (!remember) return;
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage blocked */
  }
}
