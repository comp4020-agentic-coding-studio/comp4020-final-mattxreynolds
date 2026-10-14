import type { Pose } from "../shared/intents.ts";

// The hook the 3D scene (#50) calls. Pose is low-trust (#57): fire and
// forget, no seq, throttled to one post per interval, and the server clamps it.
// On entry, the scene starts from `snapshot.pose` when it is not null.
const INTERVAL_MS = 1000;

export function createPoseSaver(voyageId: string, post: typeof fetch = fetch): { capture(pose: Pose): void; flush(): void } {
  let latest: Pose | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!latest) return;
    const body = JSON.stringify({ kind: "pose", ...latest });
    latest = null;
    void post(`/api/voyages/${voyageId}/intents`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  };
  return {
    capture(pose) {
      latest = pose;
      timer ??= setTimeout(flush, INTERVAL_MS);
    },
    flush,
  };
}
