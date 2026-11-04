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
  // headless/software renderers (tests, screenshots) still get the full look
  return "high";
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
