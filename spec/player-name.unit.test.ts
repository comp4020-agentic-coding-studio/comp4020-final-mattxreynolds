import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYER_NAME_MAX, sanitisePlayerName } from "../server/player-name.ts";

describe("sanitisePlayerName", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitisePlayerName("  Sam  ")).toEqual({ ok: true, name: "Sam" });
  });

  it("caps at 20 characters", () => {
    expect(PLAYER_NAME_MAX).toBe(20);
    expect(sanitisePlayerName("abcdefghijklmnopqrstuvwxyz")).toEqual({ ok: true, name: "abcdefghijklmnopqrst" });
  });

  it("strips control and zero-width characters", () => {
    expect(sanitisePlayerName("S\u0000a\u0007m​‍﻿⁠!")).toEqual({ ok: true, name: "Sam!" });
    expect(sanitisePlayerName("a‮b\u0085c")).toEqual({ ok: true, name: "abc" });
  });

  it("keeps markup characters as typed, to be escaped where the name is drawn", () => {
    expect(sanitisePlayerName(`<b>"Tom" & 'Jo'</b>`)).toEqual({ ok: true, name: `<b>"Tom" & 'Jo'</b>` });
    expect(sanitisePlayerName("Tom & Jo")).toEqual({ ok: true, name: "Tom & Jo" });
  });

  it("refuses an empty name, including one that is only stripped characters", () => {
    expect(sanitisePlayerName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(sanitisePlayerName("​\u0000")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses non-strings", () => {
    expect(sanitisePlayerName(42)).toEqual({ ok: false, reason: "not a string" });
  });

  it("refuses a blocklisted name, however it is disguised", () => {
    for (const bad of ["fuck", "FUCK you", "f​u​ck", "sh1t"]) {
      expect(sanitisePlayerName(bad), bad).toEqual({ ok: false, reason: "blocked" });
    }
    expect(sanitisePlayerName("Scunthorpe")).toEqual({ ok: true, name: "Scunthorpe" });
  });
});

// Names are stored as typed, so safety is on the way out (#10): Svelte escapes every
// text interpolation, and nothing in client/ may write a name (or anything) as raw HTML.
describe("a Player name is drawn as text", () => {
  it("no client file renders raw HTML", () => {
    const dir = join(import.meta.dirname, "..", "client");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/\{@html|innerHTML|outerHTML|insertAdjacentHTML/);
    }
  });
});
