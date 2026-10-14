import type { DatabaseSync } from "node:sqlite";
import type { LeaderboardView, PostOffer } from "../shared/lobby.ts";
import { logEvent } from "./events.ts";

// The Leaderboard (#67, #10). An entry is made only when both Players of a
// launched Voyage have consented; the Score is read from the Voyage, which only
// the server sets, never from the request. The public view is a rank, the
// Players' names and a Score, so no Draw, Clue or answer can leak into it.

const LIMIT = 100;

const launchedScore = (db: DatabaseSync, voyageId: string): number | null => {
  const row = db.prepare("SELECT score_ms FROM voyage WHERE id = ? AND outcome = 'launched'").get(voyageId) as { score_ms: number } | undefined;
  return row?.score_ms ?? null;
};

const isPosted = (db: DatabaseSync, voyageId: string): boolean =>
  db.prepare("SELECT 1 FROM leaderboard_entry WHERE voyage_id = ?").get(voyageId) !== undefined;

const playersOf = (db: DatabaseSync, voyageId: string): { id: string; name: string }[] =>
  db
    .prepare("SELECT p.id, p.name FROM voyage_person vp JOIN person p ON p.id = vp.person_id WHERE vp.voyage_id = ? ORDER BY p.name, p.id")
    .all(voyageId) as { id: string; name: string }[];

/** The post preview for one Player, or null unless the Voyage launched. */
export function offerFor(db: DatabaseSync, voyageId: string, personId: string): PostOffer | null {
  const scoreMs = launchedScore(db, voyageId);
  if (scoreMs === null) return null;
  const agreed = new Set(
    (db.prepare("SELECT person_id FROM leaderboard_consent WHERE voyage_id = ?").all(voyageId) as { person_id: string }[]).map((r) => r.person_id),
  );
  const players = playersOf(db, voyageId);
  return {
    scoreMs,
    players: players.map((p) => p.name),
    youConsented: agreed.has(personId),
    partnerConsented: players.some((p) => p.id !== personId && agreed.has(p.id)),
    posted: isPosted(db, voyageId),
  };
}

export type ConsentResult = "ok" | "not launched" | "posted";

/** Records or withdraws a Player's consent; the entry is posted the moment both have agreed. */
export function setConsent(db: DatabaseSync, voyageId: string, personId: string, agree: boolean): ConsentResult {
  const scoreMs = launchedScore(db, voyageId);
  if (scoreMs === null) return "not launched";
  if (isPosted(db, voyageId)) return "posted";
  if (agree) db.prepare("INSERT OR IGNORE INTO leaderboard_consent (voyage_id, person_id) VALUES (?, ?)").run(voyageId, personId);
  else db.prepare("DELETE FROM leaderboard_consent WHERE voyage_id = ? AND person_id = ?").run(voyageId, personId);
  const players = playersOf(db, voyageId);
  const agreed = (db.prepare("SELECT COUNT(*) AS n FROM leaderboard_consent WHERE voyage_id = ?").get(voyageId) as { n: number }).n;
  if (players.length === 2 && agreed === 2) {
    const now = Date.now();
    db.prepare("INSERT INTO leaderboard_entry (voyage_id, players, score_ms, posted_at) VALUES (?, ?, ?, ?)").run(
      voyageId,
      players.map((p) => p.name).join(" + "),
      scoreMs,
      now,
    );
    logEvent(db, { voyageId, at: now, action: "leaderboard.posted", detail: { score_ms: scoreMs } });
  }
  return "ok";
}

/** The public Leaderboard: visible entries, best Score (most time left) first. */
export function leaderboard(db: DatabaseSync): LeaderboardView {
  const rows = db
    .prepare("SELECT players, score_ms FROM leaderboard_entry WHERE hidden = 0 ORDER BY score_ms DESC, posted_at, voyage_id LIMIT ?")
    .all(LIMIT) as { players: string; score_ms: number }[];
  return { entries: rows.map((r, i) => ({ rank: i + 1, players: r.players, scoreMs: r.score_ms })) };
}

/** Moderation: hides an entry from the public view. False when there is no such entry. */
export function hideEntry(db: DatabaseSync, voyageId: string): boolean {
  const res = db.prepare("UPDATE leaderboard_entry SET hidden = 1 WHERE voyage_id = ?").run(voyageId);
  if (res.changes > 0) logEvent(db, { voyageId, action: "leaderboard.hidden" });
  return res.changes > 0;
}

/** Every entry, for the moderator's list. */
export function allEntries(db: DatabaseSync): { voyageId: string; players: string; scoreMs: number; hidden: boolean }[] {
  const rows = db.prepare("SELECT voyage_id, players, score_ms, hidden FROM leaderboard_entry ORDER BY score_ms DESC, posted_at").all() as {
    voyage_id: string;
    players: string;
    score_ms: number;
    hidden: number;
  }[];
  return rows.map((r) => ({ voyageId: r.voyage_id, players: r.players, scoreMs: r.score_ms, hidden: r.hidden === 1 }));
}

// Open public streams. A change sends each reader the whole current view.
const readers = new Set<() => void>();

export function subscribeLeaderboard(listener: () => void): () => void {
  readers.add(listener);
  return () => void readers.delete(listener);
}

export function publishLeaderboard(): void {
  for (const listener of readers) listener();
}
