import { expect, it } from "vitest";
import { act, command, look, newPlayer, openRoom, stationLog, stream, until, url } from "./helpers.ts";

it.each([
  { type: "flip" as const, index: 0 }, { type: "cut" as const, wire: 0 },
  { type: "symbol" as const, index: 0 }, { type: "key" as const, position: 0 },
  { type: "engage" as const }, { type: "override" as const },
])("allows Expert lifecycle commands but refuses device inputs on the server without mutation", async (action) => {
  const a = await newPlayer(), b = await newPlayer(), code = await openRoom(a);
  const seen = await look(code, "expert");
  const rejected = await command(b, seen, action, "expert");
  expect(rejected.status).toBe(403);
  const body = await rejected.json();
  expect(body.view?.device).toBeUndefined();
  expect((await look(code, "operator")).revision).toBe(0);
  expect((await command(b, seen, { type: "start" }, "expert")).status).toBe(200);
  // Selecting Operator is deliberately allowed; seats are switchable views.
  expect((await command(b, await look(code, "operator"), { type: "flip", index: 0 })).status).toBe(200);
});

it("renames only the authenticated browser and updates open presence and live mission crew", async () => {
  const a = await newPlayer(), b = await newPlayer(), code = await openRoom(a);
  const s = await stream(code, "operator", a), t = await stream(code, "expert", b);
  try {
    await until(s, v => v.crew.length === 2); await t.next();
    await act(a, code, { type: "start" });
    const renamed = await fetch(url("/api/players/me"), { method: "PATCH",
      headers: { "content-type": "application/json", "x-player": a.id },
      body: JSON.stringify({ callsign: "FRESH-NAME", id: b.id, tag: b.tag }) });
    expect(renamed.status).toBe(200);
    const updated = await until(t, v => v.crew.some(c => c.tag === a.tag && c.callsign === "FRESH-NAME"));
    expect(updated.crew.find(c => c.tag === b.tag)?.callsign).toBe(b.callsign);
    for (let i = 0; i < 3; i++) await act(b, code, { type: "override" });
    const run = (await stationLog(a)).runs.find(r => r.roomCode === code)!;
    expect(run.crew.find(c => c.tag === a.tag)?.callsign).toBe("FRESH-NAME");
    expect(run.crew.find(c => c.tag === b.tag)?.callsign).toBe(b.callsign);
  } finally { s.close(); t.close(); }
});
