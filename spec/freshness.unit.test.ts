import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../server/database.ts";
import { judge, liveEntry, loadDraw, storeDraw } from "../server/draw.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { createGuest } from "../server/people.ts";
import { joinVoyage, startVoyage } from "../server/voyages.ts";

const setup = () => {
  const db = openDatabase(mkdtempSync(join(tmpdir(), "fresh-")));
  const person = () => createGuest(db).person.id;
  /** A Voyage with these Persons seated and its Draw stored; returns the Draw's Puzzle keys. */
  const sail = (a: string, b: string, at: number): string[] => {
    const v = startVoyage(db, a);
    joinVoyage(db, b, { key: v.link.slice(3) });
    db.prepare("UPDATE voyage SET cast_off_at = ? WHERE id = ?").run(at, v.id);
    storeDraw(db, v.id);
    const raw = (db.prepare("SELECT draw FROM voyage WHERE id = ?").get(v.id) as { draw: string }).draw;
    return loadDraw(raw).puzzles.map((p) => p.key);
  };
  return { person, sail };
};

const shared = (a: string[], b: string[]) => a.filter((k, i) => k === b[i]).length;

describe("freshness (#65)", () => {
  it("a known Team's consecutive Draws share at most half their Puzzles, whichever Decks each Person takes", () => {
    const { person, sail } = setup();
    const [x, y] = [person(), person()];
    let last = sail(x, y, 1);
    for (let i = 2; i < 80; i++) {
      // the same two Persons in either seating order are the same Team
      const next = i % 2 ? sail(x, y, i) : sail(y, x, i);
      expect(shared(last, next)).toBeLessThanOrEqual(1);
      last = next;
    }
  });

  it("a new pairing gets a plain random pick per slot", () => {
    const { person, sail } = setup();
    const x = person();
    const first = sail(x, person(), 1);
    let allSame = 0;
    for (let i = 0; i < 100; i++) {
      // a fresh partner each time: never a known Team with x
      if (shared(first, sail(x, person(), 2 + i)) === 3) allSame++;
    }
    // plain random over two Puzzles per slot repeats all three about 1 time in 8
    expect(allSame).toBeGreaterThan(2);
  });
});

// ADR 0001: a Draw stored by an earlier deploy still loads and plays to solved.
// The fixture is hand-written JSON, frozen as the version-1 shape; if a Puzzle's
// data shape ever changes, this stays readable only while the old version does.
describe("a stored previous-version Draw", () => {
  const stored = JSON.stringify({
    puzzles: [
      {
        slot: "opener",
        key: "mural-keypad@1",
        data: { direction: "left", panels: [{ motif: "lanterns", count: 9 }, { motif: "anchors", count: 5 }, { motif: "bells", count: 5 }, { motif: "lanterns", count: 5 }] },
      },
    ],
  });

  it("loads and plays through to solved", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "fixture-")));
    const a = createGuest(db).person.id;
    const v = startVoyage(db, a);
    db.prepare("UPDATE voyage SET draw = ?, draw_version = 1 WHERE id = ?").run(stored, v.id);
    const entry = liveEntry(db, v.id)!;
    expect(entry.version.key).toBe("mural-keypad@1");
    expect(judge(db, v.id, "opener", codeFromClue(entry.version.clue(entry.data)))).toEqual({ kind: "solved", slot: "opener" });
    expect(liveEntry(db, v.id)).toBeNull();
  });
});
