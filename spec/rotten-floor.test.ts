import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PublicDraw } from "../shared/draw.ts";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { type Dir, DIRS, parsePlan, routes } from "./helpers/rotten-floor.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { intent, snapshot, underway, underwayAtMiddle } from "./helpers/voyage.ts";

let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];

const snap = (voyageId: string, who: Who): Promise<LobbySnapshot> => snapshot(server.url, voyageId, who.cookie);
const draw = async (voyageId: string, who: Who): Promise<PublicDraw> => (await snap(voyageId, who)).draw!;
const step = (voyageId: string, who: Who, dir: unknown, extra: Record<string, unknown> = {}) =>
  intent(server.url, voyageId, who, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir, ...extra });

/** An underway Voyage with the opener's hatch open, so the middle is live. Host walks (Upper Deck), partner holds the plan. */
async function atTheFloor() {
  const l = await underwayAtMiddle(server.url, "rotten-floor"); // the Draw picks the middle at random (#63)
  const plan = parsePlan((await draw(l.voyage.id, l.partner)).puzzles[1].clue!);
  return { ...l, plan, route: routes(plan)[0] };
}

function events(voyageId: string): { action: string; actor: string | null; detail: string }[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT action, actor, detail FROM event WHERE voyage_id = ? ORDER BY id").all(voyageId) as {
    action: string;
    actor: string | null;
    detail: string;
  }[];
  db.close();
  return rows;
}

it("once the hatch is open the Walker sees lit tiles and no plan, and the plan holder sees the plan and no Walker", async () => {
  const { voyage, host, partner } = await atTheFloor();
  const walker = (await draw(voyage.id, host)).puzzles[1];
  const holder = (await draw(voyage.id, partner)).puzzles[1];
  expect([walker.status, walker.role]).toEqual(["live", "lock"]);
  expect(walker.clue).toBeUndefined();
  expect(walker.walk!.lit.length).toBeGreaterThan(0);
  expect(JSON.stringify(await snap(voyage.id, host))).not.toMatch(/Row \d|trapdoor|plan/i);
  expect([holder.status, holder.role]).toEqual(["live", "clue"]);
  expect(holder.walk).toBeUndefined();
  expect(holder.clue).toMatch(/Row 1:/);
  expect(JSON.stringify(await snap(voyage.id, partner))).not.toMatch(/"(walk|lit|at)"/);
});

it("the middle is dead, with no walk view, until the opener is solved", async () => {
  const { voyage, host } = await underway(server.url);
  const walker = (await draw(voyage.id, host)).puzzles[1];
  expect(walker.status).toBe("dead");
  expect(walker.walk).toBeUndefined();
  expect((await step(voyage.id, host, "north")).status).toBe(409);
});

it("walking the plan's route moves the Walker tile by tile and the far side opens the way on both Decks with one bell", async () => {
  const { voyage, host, partner, route } = await atTheFloor();
  const a = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), host.cookie);
  const b = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), partner.cookie);
  await a.stream.next();
  await b.stream.next();
  const before = (await draw(voyage.id, host)).puzzles[1].walk!.at;
  for (const dir of route.slice(0, -1)) expect((await step(voyage.id, host, dir)).status).toBe(200);
  expect((await draw(voyage.id, host)).puzzles[1].walk!.at).not.toBe(before);
  expect((await draw(voyage.id, host)).strikes).toBe(0);
  expect((await step(voyage.id, host, route[route.length - 1])).status).toBe(200);

  for (const s of [a.stream, b.stream]) {
    let frame = parseFrame(await s.next());
    while (frame.event !== "bell") frame = parseFrame(await s.next());
    expect(frame.data).toEqual({ slot: "middle" });
  }
  a.stream.close();
  b.stream.close();
  const after = await draw(voyage.id, host);
  expect(after.puzzles[1].status).toBe("solved");
  expect(after.puzzles[1].walk).toBeUndefined();
  expect(events(voyage.id).filter((e) => e.action === "puzzle.solved").map((e) => e.detail)).toEqual([
    JSON.stringify({ slot: "opener" }),
    JSON.stringify({ slot: "middle" }),
  ]);
});

it("a trapdoor is one Strike that names no Player, returns the Walker to the start and leaves the plan unchanged", async () => {
  const { voyage, host, partner, plan, route } = await atTheFloor();
  const planBefore = (await draw(voyage.id, partner)).puzzles[1].clue;
  const start = (await draw(voyage.id, host)).puzzles[1].walk!.at;
  expect((await step(voyage.id, host, route[0])).status).toBe(200);
  expect((await draw(voyage.id, host)).puzzles[1].walk!.at).not.toBe(start);

  const listener = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), partner.cookie);
  await listener.stream.next();
  // walk on along the route until a tile borders a trapdoor (the layout is random, so the
  // route's first tile may not), then step onto it
  const delta: Record<Dir, [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
  const trapdoorFrom = ([hx, hy]: [number, number]) =>
    DIRS.find((d) => {
      const x = hx + delta[d][0];
      const y = hy + delta[d][1];
      return x >= 0 && y >= 0 && x < plan.width && y < plan.height && !plan.safe.has(`${x},${y}`);
    });
  let here: [number, number] = [plan.start[0] + delta[route[0]][0], plan.start[1] + delta[route[0]][1]];
  let bad = trapdoorFrom(here);
  for (let i = 1; bad === undefined && i < route.length - 1; i++) {
    expect((await step(voyage.id, host, route[i])).status).toBe(200);
    here = [here[0] + delta[route[i]][0], here[1] + delta[route[i]][1]];
    bad = trapdoorFrom(here);
  }
  expect(bad).toBeDefined();
  expect((await step(voyage.id, host, bad)).status).toBe(200);

  const notice = parseFrame(await listener.stream.next());
  const frames = [notice];
  while (frames[frames.length - 1].event !== "strike") frames.push(parseFrame(await listener.stream.next()));
  listener.stream.close();
  expect(frames[frames.length - 1].data).toEqual({ strikes: 1 });
  const after = await draw(voyage.id, host);
  expect(after.strikes).toBe(1);
  expect(after.puzzles[1].walk!.at).toBe(start);
  expect(after.puzzles[1].status).toBe("live");
  expect((await draw(voyage.id, partner)).puzzles[1].clue).toBe(planBefore);
  const strikes = events(voyage.id).filter((e) => e.action === "strike");
  expect(strikes).toHaveLength(1);
  expect(strikes[0].actor).toBeNull();
});

it("the Walker's position survives a reload: a fresh snapshot shows the same tile", async () => {
  const { voyage, host, route } = await atTheFloor();
  await step(voyage.id, host, route[0]);
  const first = (await draw(voyage.id, host)).puzzles[1].walk!.at;
  expect((await draw(voyage.id, host)).puzzles[1].walk!.at).toBe(first);
});

it("a step from the plan holder's Deck is a 409, a step off the floor is a 409, a bad direction a 400, and none is a Strike", async () => {
  const { voyage, host, partner } = await atTheFloor();
  const seq = (await snap(voyage.id, host)).seq;
  expect((await step(voyage.id, partner, "north", { deck: "Lower Deck" })).status).toBe(409);
  expect((await step(voyage.id, host, "south")).status).toBe(409); // the start row has nothing south of it
  expect((await step(voyage.id, host, "up")).status).toBe(400);
  expect((await step(voyage.id, host, "north", { seq: seq + 5 })).status).toBe(409);
  expect((await draw(voyage.id, host)).strikes).toBe(0);
});

it("a typed answer to the walking Puzzle is a 409, never a Strike", async () => {
  const { voyage, host } = await atTheFloor();
  const res = await intent(server.url, voyage.id, host, { kind: "submit", deck: "Upper Deck", slot: "middle", answer: "1234" });
  expect(res.status).toBe(409);
  expect((await draw(voyage.id, host)).strikes).toBe(0);
});

it("the Draw holds an opener, a middle and a finale, stored with their versions", async () => {
  const { voyage } = await atTheFloor();
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const row = db.prepare("SELECT draw FROM voyage WHERE id = ?").get(voyage.id) as { draw: string };
  db.close();
  const keys = JSON.parse(row.draw).puzzles.map((p: { key: string }) => p.key) as string[];
  expect(["mural-keypad@1", "lever-order@1"]).toContain(keys[0]);
  expect(["rotten-floor@1", "bilge-plates@1"]).toContain(keys[1]);
  expect(["valves-gauges@1", "helm-telegraph@1"]).toContain(keys[2]);
});
