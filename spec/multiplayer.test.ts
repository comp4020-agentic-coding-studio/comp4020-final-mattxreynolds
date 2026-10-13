import { expect, it } from "vitest";
import { act, look, newPlayer, openRoom, url } from "./helpers.ts";

it("refuses out-of-range actions without secretly starting the clock", async () => {
  const p = await newPlayer();
  const code = await openRoom(p);
  const res = await fetch(url(`/api/rooms/${code}/actions`), {
    method: "POST",
    headers: { "content-type": "application/json", "x-player": p.id },
    body: JSON.stringify({ type: "cut", wire: 999 }),
  });
  expect(res.status).toBe(400);
  expect((await look(code, "operator")).status).toBe("ready");
});

it("does not apply two switch presses based on the same observed state", async () => {
  const a = await newPlayer(), b = await newPlayer();
  const code = await openRoom(a);
  const before = await look(code, "operator");
  await Promise.all([act(a, code, { type: "flip", index: 0 }), act(b, code, { type: "flip", index: 0 })]);
  expect((await look(code, "operator")).device!.switches.up[0]).toBe(!before.device!.switches.up[0]);
});
