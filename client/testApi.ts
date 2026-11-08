// A tiny window hook for the automated browser specs: use a control by id
// exactly as the player's E key would (same onUse path, same server intent),
// and read the current view. It grants nothing the player can't already do.

import { useById, interactables } from "./scene/interact.tsx";
import { useStore } from "./store.ts";

declare global {
  interface Window {
    __btw?: {
      use(id: string, held?: boolean): boolean;
      ids(): string[];
      view(): unknown;
    };
    __btwPose?: (p: { x?: number; z?: number; yaw?: number; pitch?: number }) => void;
    /** dev/test: the usable control at a screen point (NDC), as a tap would find it; read-only */
    __btwPick?: (x: number, y: number) => string | null;
  }
}

export function exposeTestApi(): void {
  window.__btw = {
    use: useById,
    ids: () => [...interactables.keys()],
    view: () => useStore.getState().view,
  };
}
