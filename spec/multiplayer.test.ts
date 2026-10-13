import { expect, it } from "vitest";
import { act, command, look, newPlayer, openRoom, url } from "./helpers.ts";

it("refuses out-of-range actions without secretly starting the clock", async () => {
  const p = await newPlayer();
  const code = await openRoom(p);
  const res = await command(p, await look(code, "operator"), { type: "cut", wire: 999 });
  expect(res.status).toBe(400);
  expect((await look(code, "operator")).status).toBe("ready");
});

it("does not apply two switch presses based on the same observed state", async () => {
  const a = await newPlayer(), b = await newPlayer();
  const code = await openRoom(a);
  const before = await look(code, "operator");
  const results = await Promise.all([command(a, before, { type: "flip", index: 0 }), command(b, before, { type: "flip", index: 0 })]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await look(code, "operator")).device!.switches.up[0]).toBe(!before.device!.switches.up[0]);
});

it("rejects a duplicate keypad request rather than pressing an unseen stage", async () => {
  const p = await newPlayer(), code = await openRoom(p);
  const before = await look(code, "operator");
  const k = before.device!.keypad;
  const { solveKeypad } = await import("../shared/game.ts");
  const action = { type: "key" as const, position: solveKeypad({ display: k.display!, keys: k.keys }, 0, []) };
  expect((await command(p, before, action)).status).toBe(200);
  expect((await command(p, before, action)).status).toBe(409);
  const after = await look(code, "operator");
  expect(after.device!.keypad.stage).toBe(1);
  expect(after.strikes).toBe(0);
  expect(after.revision).toBe(before.revision + 1);
});

it("orders Expert Begin and Operator input by arrival, refusing the stale loser without a strike", async () => {
  const op = await newPlayer(), ex = await newPlayer(), code = await openRoom(op);
  const seen = await look(code, "operator");
  const results = await Promise.all([
    command(ex, seen, { type: "start" }, "expert"),
    command(op, seen, { type: "flip", index: 0 }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const after = await look(code, "operator");
  expect(after.status).toBe("live");
  expect(after.strikes).toBe(0);
  expect(after.revision).toBe(seen.revision + 1);
});

it("does not let a previous mission's delayed action start a fresh device", async () => {
  const p = await newPlayer(), code = await openRoom(p);
  const old = await look(code, "operator");
  for (let i = 0; i < 3; i++) await act(p, code, { type: "override" });
  const over = await look(code, "operator");
  const reset = await Promise.all([command(p, over, { type: "newMission" }), command(p, over, { type: "newMission" })]);
  expect(reset.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await command(p, old, { type: "override" })).status).toBe(409);
  const next = await look(code, "operator");
  expect(next.missionNo).toBe(2);
  expect(next.status).toBe("ready");
  expect(next.strikes).toBe(0);
});

it("returns only the Expert projection when resolving a stale command", async () => {
  const p = await newPlayer(), code = await openRoom(p);
  const seen = await look(code, "expert");
  await act(p, code, { type: "start" });
  const res = await command(p, seen, { type: "start" }, "expert");
  const body = await res.json();
  expect(res.status).toBe(409);
  expect(body.view.revision).toBe(seen.revision + 1);
  expect(body.view.device).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(p.id);
});

it.each([
  { type: "cut", wire: -1 }, { type: "symbol", index: 4 },
  { type: "key", position: 4 }, { type: "flip", index: 5 },
  { type: "start", revision: -1 }, { type: "start", missionNo: 0 },
  { type: "start", revision: 0.5 }, { type: "start", revision: null },
])("rejects malformed or out-of-range command %j without mutation", async (bad) => {
  const p = await newPlayer(), code = await openRoom(p);
  const res = await fetch(url(`/api/rooms/${code}/actions`), {
    method: "POST", headers: { "content-type": "application/json", "x-player": p.id },
    body: JSON.stringify({ missionNo: 1, revision: 0, ...bad }),
  });
  expect(res.status).toBe(400);
  const after = await look(code, "operator");
  expect(after.status).toBe("ready");
  expect(after.revision).toBe(0);
});
