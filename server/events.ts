import type { DatabaseSync } from "node:sqlite";

export interface LogEvent {
  voyageId?: string;
  /** Public id of the Person acting; never a token. */
  actor?: string;
  actorName?: string;
  action: string;
  /** Safe fields only: never a token, password or Voyage code. */
  detail?: Record<string, string | number | boolean | null>;
}

// Each event is written twice (#11): a row in the events table, and one
// readable stdout line followed by the JSON fields. Callers pass only safe
// fields; nothing here ever sees a cookie or a Voyage code.
export function logEvent(db: DatabaseSync, e: LogEvent): void {
  const detail = e.detail ?? {};
  db.prepare("INSERT INTO event (at, voyage_id, actor, action, detail) VALUES (?, ?, ?, ?, ?)").run(
    Date.now(),
    e.voyageId ?? null,
    e.actor ?? null,
    e.action,
    JSON.stringify(detail),
  );
  const who = e.actor ? ` ${e.actor}${e.actorName ? ` ${JSON.stringify(e.actorName)}` : ""}` : "";
  const where = e.voyageId ? `[voyage ${e.voyageId}]` : "[server]";
  const text = Object.entries(detail)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`${where}${who} ${e.action}${text ? ` ${text}` : ""} ${JSON.stringify({ voyage: e.voyageId, actor: e.actor, name: e.actorName, action: e.action, ...detail })}`);
}
