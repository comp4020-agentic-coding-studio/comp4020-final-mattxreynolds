import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launch, settleClock, timeLeftMs } from "../server/clock.ts";
import { openDatabase } from "../server/database.ts";

const MIN = 60_000;

it("a fresh Clock has 30 minutes and loses real time as it passes", () => {
  expect(timeLeftMs({ startedAt: 1000, strikes: 0 }, 1000)).toBe(30 * MIN);
  expect(timeLeftMs({ startedAt: 1000, strikes: 0 }, 1000 + 10 * MIN)).toBe(20 * MIN);
});

it("each Strike takes 3 minutes off", () => {
  expect(timeLeftMs({ startedAt: 0, strikes: 1 }, 0)).toBe(27 * MIN);
  expect(timeLeftMs({ startedAt: 0, strikes: 2 }, 5 * MIN)).toBe(19 * MIN);
});

// The rules that end a Voyage, against a real database with the real migrations.
function voyageAt(strikes: number, castOffAt: number | null) {
  const db = openDatabase(mkdtempSync(join(tmpdir(), "clock-")));
  db.prepare("INSERT INTO voyage (id, code, link_key, ship_name, created_at, strikes, cast_off_at) VALUES ('v1','c','k','s',0,?,?)").run(strikes, castOffAt);
  const row = () => db.prepare("SELECT outcome, score_ms FROM voyage WHERE id='v1'").get() as { outcome: string | null; score_ms: number | null };
  return { db, row };
}

it("the third Strike sinks the ship, the second does not", () => {
  const two = voyageAt(2, 0);
  expect(settleClock(two.db, "v1", 1000)).toBe(false);
  expect(two.row().outcome).toBeNull();
  const three = voyageAt(3, 0);
  expect(settleClock(three.db, "v1", 1000)).toBe(true);
  expect(three.row().outcome).toBe("sank");
});

it("the Clock reaching zero sinks the ship, and not a moment before", () => {
  const v = voyageAt(0, 0);
  expect(settleClock(v.db, "v1", 30 * MIN - 1)).toBe(false);
  expect(settleClock(v.db, "v1", 30 * MIN)).toBe(true);
  expect(v.row().outcome).toBe("sank");
});

it("a Voyage that has not cast off has no Clock to run out", () => {
  const v = voyageAt(0, null);
  expect(settleClock(v.db, "v1", 99 * MIN)).toBe(false);
});

it("a launch just before zero wins with the time left as its Score; just after, it is refused and the ship sinks", () => {
  const before = voyageAt(1, 0);
  expect(launch(before.db, "v1", 27 * MIN - 1000)).toEqual({ kind: "launched", scoreMs: 1000 });
  expect(before.row()).toEqual({ outcome: "launched", score_ms: 1000 });
  const after = voyageAt(1, 0);
  expect(launch(after.db, "v1", 27 * MIN)).toEqual({ kind: "sank" });
  expect(after.row()).toEqual({ outcome: "sank", score_ms: null });
});

it("the stored Score equals the one the event log implies", () => {
  const v = voyageAt(2, 5000);
  const log = (at: number, action: string) =>
    v.db.prepare("INSERT INTO event (at, voyage_id, action, detail) VALUES (?, 'v1', ?, '{}')").run(at, action);
  log(5000, "voyage.cast-off");
  log(60_000, "strike");
  log(200_000, "strike");
  const result = launch(v.db, "v1", 600_000);
  const events = v.db.prepare("SELECT at, action FROM event WHERE voyage_id='v1' ORDER BY id").all() as { at: number; action: string }[];
  const castOff = events.find((e) => e.action === "voyage.cast-off")!.at;
  const launched = events.find((e) => e.action === "voyage.launched")!.at;
  const strikes = events.filter((e) => e.action === "strike").length;
  const implied = 30 * MIN - strikes * 3 * MIN - (launched - castOff);
  expect(implied).toBe(1_800_000 - 360_000 - 595_000);
  expect(result).toEqual({ kind: "launched", scoreMs: implied });
  expect(v.row().score_ms).toBe(implied);
});
