import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { LobbySnapshot } from "../shared/lobby.ts";
import { codeFromClue } from "./helpers/mural.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { guest, intent, lobby, snapshot, underway } from "./helpers/voyage.ts";

// A second server, so the events table can be read back and restarted.
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

type Who = Parameters<typeof intent>[2];

const submit = (voyageId: string, who: Who, answer: unknown, extra: Record<string, unknown> = {}) =>
  intent(server.url, voyageId, who, { kind: "submit", deck: "Lower Deck", slot: "opener", answer, ...extra });

const snap = (voyageId: string, who: Who): Promise<LobbySnapshot> => snapshot(server.url, voyageId, who.cookie);
const draw = async (voyageId: string, who: Who) => (await snap(voyageId, who)).draw!;
const stream = (voyageId: string, who: Who) => openSse(new URL(`/api/voyages/${voyageId}/events`, server.url), who.cookie);

/** Every frame up to and including the first `event`; the snapshot sent with it comes just before. */
async function until(s: { next(ms?: number): Promise<string> }, event: string): Promise<{ event: string; data: unknown }[]> {
  const out = [];
  do out.push(parseFrame(await s.next()));
  while (out[out.length - 1].event !== event);
  return out;
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

it("the Wheelhouse sees the mural Clue, the Engine Room a keypad with none, and later stations are visible but dead", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const wheelhouse = await draw(voyage.id, host);
  const engine = await draw(voyage.id, partner);
  expect(wheelhouse.puzzles.map((p) => [p.slot, p.status])).toEqual([["opener", "live"], ["middle", "dead"], ["finale", "dead"]]);
  expect(wheelhouse.puzzles[0].role).toBe("clue");
  expect(wheelhouse.puzzles[0].clue).toMatch(/Panel 1/);
  expect(engine.puzzles[0].role).toBe("lock");
  expect(engine.puzzles[0].clue).toBeUndefined();
});

it("a Voyage that has not cast off has no Draw to show", async () => {
  const { voyage, host } = await lobby(server.url);
  expect((await snap(voyage.id, host)).draw).toBeNull();
});

it("a correct code opens the hatch on both Decks with one bell, from the Clue text alone", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await draw(voyage.id, host)).puzzles[0].clue!);
  const a = await stream(voyage.id, host);
  const b = await stream(voyage.id, partner);

  const seq = (await snap(voyage.id, partner)).seq;
  expect((await submit(voyage.id, partner, code, { seq })).status).toBe(200);

  for (const s of [a.stream, b.stream]) {
    const frames = await until(s, "bell");
    const shot = frames[frames.length - 2].data as LobbySnapshot;
    expect(shot.draw!.puzzles[0].status).toBe("solved");
    await expect(s.next(300)).rejects.toThrow(/no SSE frame/);
  }
  a.stream.close();
  b.stream.close();
  expect(events(voyage.id).filter((e) => e.action === "puzzle.solved")).toHaveLength(1);
});

it("a wrong code is a Strike on the Voyage that names no Player, in the announcement, the log or the snapshot", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await draw(voyage.id, host)).puzzles[0].clue!);
  const wrong = code === "0000" ? "0001" : "0000";
  const seq = (await snap(voyage.id, partner)).seq;
  const listener = await stream(voyage.id, host);

  expect((await submit(voyage.id, partner, wrong, { seq })).status).toBe(200);

  const frames = await until(listener.stream, "strike");
  listener.stream.close();
  const strike = frames[frames.length - 1];
  expect(strike.data).toEqual({ strikes: 1 });
  // the Draw and the notice name no Player (the lobby part of a snapshot names both, by design)
  const seen = JSON.stringify([strike, (frames[frames.length - 2].data as LobbySnapshot).draw]);
  expect(seen).not.toContain(partner.id);
  expect(seen).not.toContain(partner.name);
  expect((await draw(voyage.id, host)).strikes).toBe(1);
  expect((await draw(voyage.id, host)).puzzles[0].status).toBe("live");
  const logged = events(voyage.id).filter((e) => e.action === "strike");
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBeNull();
  expect(logged[0].detail).not.toMatch(/answer|code/);
  expect(events(voyage.id).map((e) => e.detail).join()).not.toContain(`"${wrong}"`);
});

it("sending the same submission twice cannot Strike twice", async () => {
  const { voyage, partner } = await underway(server.url);
  const code = "0000";
  const seq = (await snap(voyage.id, partner)).seq;
  const first = await submit(voyage.id, partner, code, { seq });
  const second = await submit(voyage.id, partner, code, { seq });
  expect([first.status, second.status]).toEqual([200, 409]);
  const after = await draw(voyage.id, partner);
  expect(after.strikes + (after.puzzles[0].status === "solved" ? 1 : 0)).toBe(1);
});

it("a submission to a dead station or from the Clue Deck is a 409, a malformed one a 400, and none is a Strike", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await draw(voyage.id, host)).puzzles[0].clue!);
  expect((await submit(voyage.id, partner, "0000", { slot: "middle" })).status).toBe(409);
  expect((await submit(voyage.id, host, "0000", { deck: "Upper Deck" })).status).toBe(409);
  expect((await submit(voyage.id, partner, 12)).status).toBe(400);
  expect((await draw(voyage.id, partner)).strikes).toBe(0);
  expect((await submit(voyage.id, partner, code)).status).toBe(200);
  expect((await submit(voyage.id, partner, "0000")).status).toBe(409); // already solved
  expect((await draw(voyage.id, partner)).strikes).toBe(0);
});

it("no payload or event to either Deck holds the other Deck's Clue data or the answer, and a non-seated Person gets nothing", async () => {
  const { voyage, host, partner } = await underway(server.url);
  const code = codeFromClue((await draw(voyage.id, host)).puzzles[0].clue!);
  const engine = JSON.stringify(await snap(voyage.id, partner));
  expect(engine).not.toMatch(/Panel|lanterns|bells|anchors|gulls|direction|panels/);
  for (const payload of [engine, JSON.stringify(await snap(voyage.id, host))]) {
    expect(payload).not.toContain(`"${code}"`);
    expect(payload).not.toMatch(/"(answer|data|panels)"/);
  }
  const stranger = await guest(server.url);
  expect((await stream(voyage.id, stranger)).status).toBe(403);
  const refused = await submit(voyage.id, host, "0000", { deck: "Upper Deck" });
  expect(await refused.text()).not.toMatch(/Panel|"answer"/);
});

it("the Draw is stored in full with draw_version, and a restart resumes the same Clue", async () => {
  const local = await startSecondServer();
  const { voyage, host } = await underway(local.url);
  const before = await snapshot(local.url, voyage.id, host.cookie);
  await local.stop();
  const db = new DatabaseSync(join(local.dataDir, "game.db"), { readOnly: true });
  const row = db.prepare("SELECT draw, draw_version FROM voyage WHERE id = ?").get(voyage.id) as { draw: string; draw_version: number };
  db.close();
  expect(row.draw_version).toBe(1);
  expect(JSON.parse(row.draw).puzzles[0].key).toBe("mural-keypad@1");
  const again = await startSecondServer({ dataDir: local.dataDir });
  const after = await snapshot(again.url, voyage.id, host.cookie);
  expect(after.draw!.puzzles[0].clue).toBe(before.draw!.puzzles[0].clue);
  await again.stop();
});
