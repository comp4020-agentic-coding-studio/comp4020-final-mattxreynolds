import { describe, expect, it } from "vitest";
import * as G from "../shared/game.ts";
import type { RoomView } from "../shared/view.ts";
import { act, look, newPlayer, openRoom, stationLog, stream, url } from "./helpers.ts";

// The promises Dead Air makes, checked against the running app.

const strikeOut = async (p: Awaited<ReturnType<typeof newPlayer>>, code: string) => {
  // the override is locked until the other four modules clear: each press is a strike
  let v: RoomView | null = null;
  for (let i = 0; i < G.MAX_STRIKES; i++) v = await act(p, code, { type: "override" });
  return v!;
};

describe("the station log", () => {
  it("keeps every finished run, with its crew, for everyone to see", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    const end = await strikeOut(alice, code);
    expect(end.status).toBe("over");
    expect(end.outcome).toBe("exploded");

    const mine = await stationLog(alice);
    const run = mine.runs.find((r) => r.roomCode === code);
    expect(run, "the run is on the log").toBeDefined();
    expect(run!.crew.map((c) => c.callsign)).toContain(alice.callsign);
    expect(run!.mine).toBe(true);
    expect(mine.you!.missions).toBeGreaterThanOrEqual(1);

    // a stranger sees the same run, not marked as theirs
    const theirs = await stationLog(await newPlayer());
    const seen = theirs.runs.find((r) => r.roomCode === code);
    expect(seen).toBeDefined();
    expect(seen!.mine).toBe(false);
  });

  it("never exposes a player's secret id", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    await strikeOut(alice, code);
    const body = JSON.stringify(await stationLog(null));
    expect(body).not.toContain(alice.id);
  });
});

describe("rooms", () => {
  it("are isolated: one room's mistakes don't touch another's", async () => {
    const alice = await newPlayer();
    const bob = await newPlayer();
    const a = await openRoom(alice);
    const b = await openRoom(bob);
    expect(a).not.toBe(b);
    await act(alice, a, { type: "override" });
    expect((await look(a, "operator")).strikes).toBe(1);
    const other = await look(b, "operator");
    expect(other.strikes).toBe(0);
    expect(other.status).toBe("ready");
  });

  it("never send the device to the Expert's seat", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    const operator = await look(code, "operator");
    const expert = await look(code, "expert");
    expect(operator.device).toBeDefined();
    expect(expert.device).toBeUndefined();
    expect(JSON.stringify(expert)).not.toContain(operator.device!.serial);

    const s = await stream(code, "expert", alice);
    const streamed = await s.next();
    s.close();
    expect(streamed.device).toBeUndefined();
  });

  it("carry one player's action to another open session within a second", async () => {
    const alice = await newPlayer();
    const bob = await newPlayer();
    const code = await openRoom(alice);
    const s = await stream(code, "expert", bob);
    await s.next(); // the view on connect
    const sent = Date.now();
    await act(alice, code, { type: "override" });
    let v = await s.next();
    while (v.strikes === 0) v = await s.next();
    s.close();
    expect(v.strikes).toBe(1);
    expect(Date.now() - sent).toBeLessThan(1000);
  });

  it("refuse malformed actions without starting the clock", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    const res = await fetch(url(`/api/rooms/${code}/actions`), {
      method: "POST",
      headers: { "content-type": "application/json", "x-player": alice.id },
      body: JSON.stringify({ type: "cut", wire: "red" }),
    });
    expect(res.status).toBe(400);
    expect((await look(code, "operator")).status).toBe("ready");
  });

  it("load a fresh device for the next mission once a run ends", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    const first = (await look(code, "operator")).device!;
    await strikeOut(alice, code);
    const next = await act(alice, code, { type: "newMission" });
    expect(next.missionNo).toBe(2);
    expect(next.status).toBe("ready");
    expect(next.strikes).toBe(0);
    expect(next.device).not.toEqual(first);
  });
});

describe("the manual", () => {
  it("is enough to defuse a device: following its rules clears all five modules", async () => {
    const alice = await newPlayer();
    const code = await openRoom(alice);
    let v = await look(code, "operator");
    const d = v.device!;
    const device = {
      serial: d.serial,
      wires: d.wires.map((w) => w.color),
      symbols: d.symbols.map((s) => s.glyph),
      switches: { lights: d.switches.lights, initial: d.switches.up },
      override: d.override,
    } as G.Device;

    v = await act(alice, code, { type: "cut", wire: G.solveWires(device) });
    for (const index of G.solveSymbols(device)) v = await act(alice, code, { type: "symbol", index });
    const history: G.KeyPress[] = [];
    for (let stage = 0; stage < 4; stage++) {
      const k = v.device!.keypad;
      const position = G.solveKeypad({ display: k.display!, keys: k.keys }, stage, history);
      history.push({ position, label: k.keys[position] });
      v = await act(alice, code, { type: "key", position });
    }
    const target = G.solveSwitches(device);
    for (let i = 0; i < target.length; i++) {
      if (v.device!.switches.up[i] !== target[i]) v = await act(alice, code, { type: "flip", index: i });
    }
    v = await act(alice, code, { type: "engage" });
    expect(v.strikes, "no strikes before the override").toBe(0);
    expect(v.solved).toMatchObject({ wires: true, symbols: true, keypad: true, switches: true });

    // wait for a countdown reading the override's rule accepts
    for (;;) {
      const clock = G.formatClock(v.endsAt! - v.serverNow);
      if (G.overrideTimeOk(device, clock)) break;
      await new Promise((r) => setTimeout(r, 250));
      v = await look(code, "operator");
    }
    v = await act(alice, code, { type: "override" });
    expect(v.outcome).toBe("defused");
    expect(v.strikes).toBe(0);
    const run = (await stationLog(alice)).runs.find((r) => r.roomCode === code);
    expect(run?.outcome).toBe("defused");
    expect(run?.modulesCleared).toBe(5);
  }, 20_000);
});

describe("players", () => {
  it("can rename, and bad callsigns are refused", async () => {
    const alice = await newPlayer();
    expect(alice.callsign).toMatch(/^[A-Z0-9][A-Z0-9-]{1,15}$/);
    const rename = (callsign: string) =>
      fetch(url("/api/players/me"), {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-player": alice.id },
        body: JSON.stringify({ callsign }),
      });
    expect((await (await rename("night owl")).json()).callsign).toBe("NIGHT-OWL");
    expect((await rename("<script>")).status).toBe(400);
    expect((await rename("x".repeat(40))).status).toBe(400);
  });
});
