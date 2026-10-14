import { afterAll, beforeAll, expect, it } from "vitest";
import type { PublicDraw } from "../shared/draw.ts";
import { parsePlan, routes } from "./helpers/rotten-floor.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { guest, intent, snapshot, underwayAtMiddle } from "./helpers/voyage.ts";

// The middle's bilge plates, played over the wire (#63).
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];
const draw = async (voyageId: string, who: Who): Promise<PublicDraw> => (await snapshot(server.url, voyageId, who.cookie)).draw!;
const step = (voyageId: string, who: Who, dir: string) =>
  intent(server.url, voyageId, who, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir });

it("the survey is on the Engine Room only, the Wheelhouse sees lit plates and nothing of the survey: no payload holds the other Deck's data", async () => {
  const { voyage, host, partner } = await underwayAtMiddle(server.url, "bilge-plates");
  const survey = (await draw(voyage.id, partner)).puzzles[1].clue!;
  expect(survey).toMatch(/Bilge survey/);
  const walkerSide = JSON.stringify(await snapshot(server.url, voyage.id, host.cookie));
  expect(walkerSide).not.toMatch(/Bilge|survey|bear weight|rotten|"(path|data|answer)"/i);
  for (const line of survey.split("\n").slice(3)) expect(walkerSide).not.toContain(line);
  const engineSide = JSON.stringify(await snapshot(server.url, voyage.id, partner.cookie));
  expect(engineSide).not.toMatch(/"(walk|lit|at|path|data|answer)"/);
  const stranger = await guest(server.url);
  const res = await fetch(new URL(`/api/voyages/${voyage.id}/events`, server.url), { headers: { cookie: stranger.cookie } });
  expect(res.status).toBe(403);
});

it("a rotten plate is one Strike that names no Player and returns the Walker to the start; the survey's route then opens the way", async () => {
  const { voyage, host, partner } = await underwayAtMiddle(server.url, "bilge-plates");
  const plan = parsePlan((await draw(voyage.id, partner)).puzzles[1].clue!);
  const route = routes(plan)[0];
  const start = (await draw(voyage.id, host)).puzzles[1].walk!.at;
  const delta = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] } as const;
  const bad = (["east", "west", "north"] as const).find((d) => {
    const x = plan.start[0] + delta[d][0];
    const y = plan.start[1] + delta[d][1];
    return x >= 0 && x < plan.width && y < plan.height && !plan.safe.has(`${x},${y}`);
  });
  if (bad) {
    const listener = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), partner.cookie);
    await listener.stream.next();
    expect((await step(voyage.id, host, bad)).status).toBe(200);
    let frame = parseFrame(await listener.stream.next());
    while (frame.event !== "strike") frame = parseFrame(await listener.stream.next());
    listener.stream.close();
    expect(frame.data).toEqual({ strikes: 1 });
    const after = await draw(voyage.id, host);
    expect(after.strikes).toBe(1);
    expect(after.puzzles[1].walk!.at).toBe(start);
  }
  for (const dir of route) expect((await step(voyage.id, host, dir)).status).toBe(200);
  const done = await draw(voyage.id, host);
  expect(done.puzzles[1].status).toBe("solved");
  expect(done.strikes).toBe(bad ? 1 : 0);
});
