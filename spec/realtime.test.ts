import { expect, it } from "vitest";
import { act, command, logStream, look, newPlayer, openRoom, stream, until } from "./helpers.ts";

it("fans out to every seat within a second and never leaks device or player credentials", async () => {
  const a = await newPlayer(), b = await newPlayer(), c = await newPlayer();
  const code = await openRoom(a);
  const op = await stream(code, "operator", b), ex = await stream(code, "expert", c);
  try {
    await until(op, v => v.crew.length === 2);
    await ex.next();
    const sent = performance.now();
    await act(a, code, { type: "override" });
    const [x, y] = await Promise.all([until(op, v => v.strikes === 1), until(ex, v => v.strikes === 1)]);
    expect(performance.now() - sent).toBeLessThan(1000);
    expect(x.endsAt).toBe(y.endsAt);
    expect(x.revision).toBe(y.revision);
    expect(y.device).toBeUndefined();
    expect(JSON.stringify([x, y])).not.toContain(a.id);
    expect(JSON.stringify([x, y])).not.toContain(b.id);
    expect(JSON.stringify([x, y])).not.toContain(c.id);
  } finally { op.close(); ex.close(); }
});

it("isolates streams and cleans up presence without invalidating a read-back", async () => {
  const a = await newPlayer(), b = await newPlayer();
  const code = await openRoom(a), other = await openRoom(b);
  const s = await stream(code, "operator", a);
  const t = await stream(other, "expert", b);
  let join: Awaited<ReturnType<typeof stream>> | null = null;
  try {
    const seen = await s.next(); await t.next();
    join = await stream(code, "expert", b); await join.next();
    const joined = await until(s, v => v.crew.length === 2);
    expect(joined.revision).toBe(seen.revision);
    expect((await command(a, seen, { type: "start" })).status).toBe(200);
    join.close(); join = null;
    await until(s, v => v.crew.length === 1 && v.status === "live");
    await expect(until(t, v => v.status !== "ready", 200)).rejects.toThrow("no relevant event");
    const isolated = await look(other, "expert");
    expect(isolated.revision).toBe(0);
    expect(isolated.crew.map(c => c.tag)).toEqual([b.tag]);
  } finally { s.close(); t.close(); join?.close(); }
});

it("reconnects from a full current snapshot even when the mission ended while absent", async () => {
  const a = await newPlayer(), b = await newPlayer(), code = await openRoom(a);
  const first = await stream(code, "expert", b);
  await first.next(); first.close();
  await act(a, code, { type: "override" });
  await act(a, code, { type: "override" });
  const end = await act(a, code, { type: "override" });
  const resumed = await stream(code, "expert", b);
  try {
    const v = await resumed.next();
    expect(v.status).toBe("over");
    expect(v.outcome).toBe("exploded");
    expect(v.revision).toBe(end.revision);
    expect(v.endsAt).toBe(end.endsAt);
    expect(v.device).toBeUndefined();
  } finally { resumed.close(); }
});

it("publishes finished runs to open station logs within a second, personalised per viewer", async () => {
  const a = await newPlayer(), b = await newPlayer(), code = await openRoom(a);
  const mine = await logStream(a), theirs = await logStream(b);
  try {
    await mine.next(); await theirs.next();
    await act(a, code, { type: "override" }); await act(a, code, { type: "override" });
    const sent = performance.now(); await act(a, code, { type: "override" });
    const [m, t] = await Promise.all([until(mine, v => v.runs.some(r => r.roomCode === code)), until(theirs, v => v.runs.some(r => r.roomCode === code))]);
    expect(performance.now() - sent).toBeLessThan(1000);
    expect(m.runs.find(r => r.roomCode === code)!.mine).toBe(true);
    expect(t.runs.find(r => r.roomCode === code)!.mine).toBe(false);
    expect(JSON.stringify([m, t])).not.toContain(a.id);
  } finally { mine.close(); theirs.close(); }
});
