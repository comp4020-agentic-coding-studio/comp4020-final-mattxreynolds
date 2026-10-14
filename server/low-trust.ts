import type { DatabaseSync } from "node:sqlite";
import type { Slot } from "../shared/draw.ts";
import { lowTrustSchema, type Pose } from "../shared/intents.ts";
import { seatsOf } from "./lobby.ts";

// The two low-trust intent kinds (#57): pose and keypad draft. Each is one
// overwritten row per Player, owner-only, outside the 409 checks, never
// logged, and never published: a Player's own next snapshot is how it comes
// back. Nothing here touches the events table or stdout.

/** Half the span of the largest Deck, generous; the server only keeps a lie from being huge. */
export const POSE_LIMIT = 100;

const clamp = (n: number, lim: number): number => Math.max(-lim, Math.min(lim, n));

/** Position pulled into the box, pitch into straight up and down, yaw wrapped into (-PI, PI]. */
export function clampPose(p: Pose): Pose {
  const twoPi = 2 * Math.PI;
  let yaw = ((((p.yaw + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  if (yaw === -Math.PI) yaw = Math.PI;
  return { x: clamp(p.x, POSE_LIMIT), y: clamp(p.y, POSE_LIMIT), z: clamp(p.z, POSE_LIMIT), yaw, pitch: clamp(p.pitch, Math.PI / 2) };
}

export const isLowTrustKind = (raw: unknown): boolean =>
  typeof raw === "object" && raw !== null && ["pose", "keypad-draft"].includes((raw as { kind?: unknown }).kind as string);

export type LowTrustOutcome = { ok: true } | { ok: false; status: 400 | 403 };

export function saveLowTrust(db: DatabaseSync, voyageId: string, personId: string, raw: unknown): LowTrustOutcome {
  if (!seatsOf(db, voyageId).some((s) => s.person_id === personId)) return { ok: false, status: 403 };
  const parsed = lowTrustSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400 };
  const i = parsed.data;
  if (i.kind === "pose") {
    const p = clampPose(i);
    db.prepare(
      "INSERT OR REPLACE INTO pose (voyage_id, person_id, x, y, z, yaw, pitch) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(voyageId, personId, p.x, p.y, p.z, p.yaw, p.pitch);
  } else if (i.text === "") {
    db.prepare("DELETE FROM keypad_draft WHERE voyage_id = ? AND person_id = ? AND slot = ?").run(voyageId, personId, i.slot);
  } else {
    db.prepare("INSERT OR REPLACE INTO keypad_draft (voyage_id, person_id, slot, text) VALUES (?, ?, ?, ?)").run(
      voyageId,
      personId,
      i.slot,
      i.text,
    );
  }
  return { ok: true };
}

/** This Player's own pose; the query is keyed by their id, so no other row can leak. */
export function poseOf(db: DatabaseSync, voyageId: string, personId: string): Pose | null {
  const r = db.prepare("SELECT x, y, z, yaw, pitch FROM pose WHERE voyage_id = ? AND person_id = ?").get(voyageId, personId);
  return (r as unknown as Pose | undefined) ?? null;
}

export function draftsOf(db: DatabaseSync, voyageId: string, personId: string): Partial<Record<Slot, string>> {
  const rows = db.prepare("SELECT slot, text FROM keypad_draft WHERE voyage_id = ? AND person_id = ?").all(voyageId, personId) as {
    slot: Slot;
    text: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.slot, r.text]));
}
