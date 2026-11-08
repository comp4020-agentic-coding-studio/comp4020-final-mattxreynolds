// Promise: "Sail again" keeps the crew together. From SURVIVED/LOST either
// player starts the next voyage; both are moved to the same new code with the
// same roles, their existing tokens still seat them, the old voyage stays in
// the Ship's Log, and a second request never makes a second voyage.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connectPlayer, events, jump, launch, nextEvent, survive, type Player } from "./helpers/client.ts";
import { startServer, type TestServer } from "./helpers/server.ts";

let server: TestServer;
let open: Player[] = [];
beforeAll(async () => {
  server = await startServer({ testHooks: true });
});
afterEach(() => {
  open.forEach((p) => p.close());
  open = [];
});
afterAll(async () => {
  await server?.dispose();
});
const track = <T extends Player[]>(ps: T): T => {
  open.push(...ps);
  return ps;
};

async function sailAgainFrom(eng: Player, nav: Player, by: Player, other: Player) {
  const oldCode = eng.code;
  const movedEng = nextEvent<{ code: string; by: string }>(eng.socket, "moved");
  const movedNav = nextEvent<{ code: string; by: string }>(nav.socket, "moved");
  expect((await by.send({ t: "sailAgain" })).ok).toBe(true);
  const [me, mn] = await Promise.all([movedEng, movedNav]);
  expect(me.code).toBe(mn.code);
  expect(me.code).not.toBe(oldCode);
  expect(me.code).toMatch(/^[A-Z2-9]{4}$/);
  expect(me.by).toBe(by.role);

  // the other player asking too lands on the same next voyage
  const again = nextEvent<{ code: string }>(other.socket, "moved");
  expect((await other.send({ t: "sailAgain" })).ok).toBe(true);
  expect((await again).code).toBe(me.code);
  return me.code;
}

describe("sail again keeps the same crew, roles and tokens", () => {
  it("after SURVIVED: both moved to one new LOBBY voyage, same roles, old voyage logged", async () => {
    const [eng, nav] = track(await launch(server.url, ["ADA", "LIN"]));
    await survive(server.url, eng, nav);
    const oldCode = eng.code;
    const next = await sailAgainFrom(eng, nav, eng, nav);

    const [eng2, nav2] = track([
      await connectPlayer(server.url, { ...eng, code: next }),
      await connectPlayer(server.url, { ...nav, code: next }),
    ]);
    expect(eng2.view!.you).toBe("ENGINEER");
    expect(nav2.view!.you).toBe("NAVIGATOR");
    expect(eng2.view!.phase).toBe("LOBBY");
    expect(eng2.view!.code).toBe(next);
    expect(eng2.view!.crew.map((c) => [c.role, c.callsign, c.ready])).toEqual([
      ["ENGINEER", "ADA", false],
      ["NAVIGATOR", "LIN", false],
    ]);
    // the ending screen now points at the next voyage
    const outcome = (await connectPlayer(server.url, eng).then((p) => (track([p]), p))).view!.outcome;
    expect(outcome?.nextCode).toBe(next);

    // exactly one new voyage was created
    const created = (await events(server.url, next)).filter((e) => e.kind === "created");
    expect(created).toHaveLength(1);
    expect(created[0].detail).toContain(oldCode);

    // the old voyage is still in the log; the new one (unstarted) is not
    const hist = await (await fetch(new URL("/api/history", server.url))).json();
    const codes = hist.voyages.map((r: { code: string }) => r.code);
    expect(codes).toContain(oldCode);
    expect(codes).not.toContain(next);
    expect(hist.voyages.find((r: { code: string }) => r.code === oldCode).outcome).toBe("SURVIVED");
    expect(await (await fetch(new URL("/history/", server.url))).text()).toContain(`VOYAGE ${oldCode}`);

    // and the new voyage can actually be played
    await eng2.send({ t: "setReady", ready: true });
    await nav2.send({ t: "setReady", ready: true });
    await eng2.waitFor((v) => v.phase === "PROLOGUE");
    await nav2.waitFor((v) => v.phase === "PROLOGUE");
  });

  it("after LOST: the Navigator can start it, and the Engineer's request reuses it", async () => {
    const [eng, nav] = track(await launch(server.url, ["RHEA", "OTTO"]));
    await jump(server.url, [eng, nav], { phase: "RADIO", deepestPhase: "RADIO", danger: 99.95 });
    await eng.waitFor((v) => v.phase === "LOST", 8000);
    await nav.waitFor((v) => v.phase === "LOST");
    const next = await sailAgainFrom(eng, nav, nav, eng);
    const [nav2] = track([await connectPlayer(server.url, { ...nav, code: next })]);
    expect(nav2.view!.you).toBe("NAVIGATOR");
    expect(nav2.view!.phase).toBe("LOBBY");
    // a stranger cannot squeeze into the new voyage: both seats came along
    const join = await fetch(new URL(`/api/voyages/${next}/join`, server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callsign: "EVE" }),
    });
    expect(join.status).toBe(409);
  });

  it("sail again is refused while the voyage is still at sea", async () => {
    const [eng] = track(await launch(server.url));
    expect(await eng.send({ t: "sailAgain" })).toMatchObject({ ok: false, reason: "wrong-phase" });
  });
});
