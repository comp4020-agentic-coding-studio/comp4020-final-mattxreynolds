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

  it("HTML-escapes", () => {
    expect(sanitisePlayerName(`<b>"Tom" & 'Jo'</b>`)).toEqual({
      ok: true,
      name: "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;",
    });
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
