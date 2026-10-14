import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { guest, intent, lobby, post, snapshot } from "./helpers/voyage.ts";

interface Listed {
  unfinished: { id: string; ship: string; code: string; link: string }[];
  finished: { id: string; ship: string; outcome: string }[];
}

let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

const list = async (cookie: string): Promise<Listed> =>
  (await (await fetch(new URL("/api/voyages", server.url), { headers: { cookie } })).json()) as Listed;

it("a Person with two unfinished Voyages sees both with their codes, and can resume either", async () => {
  const host = await guest(server.url);
  const a = (await (await post(server.url, "/api/voyages", host.cookie, {})).json()) as { id: string; code: string };
  const b = (await (await post(server.url, "/api/voyages", host.cookie, {})).json()) as { id: string; code: string };
  const listed = await list(host.cookie);
  expect(listed.unfinished.map((v) => v.id).sort()).toEqual([a.id, b.id].sort());
  expect(listed.unfinished.find((v) => v.id === a.id)!.code).toBe(a.code);
  expect(listed.finished).toEqual([]);
  // resuming is opening the Voyage's stream again
  expect((await snapshot(server.url, a.id, host.cookie)).voyage.id).toBe(a.id);
  expect((await snapshot(server.url, b.id, host.cookie)).voyage.id).toBe(b.id);
});

it("ending one Voyage moves it to Finished as abandoned for both Players, and leaves the other alone", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  const other = (await (await post(server.url, "/api/voyages", host.cookie, {})).json()) as { id: string };
  const before = await list(host.cookie);
  const res = await intent(server.url, voyage.id, partner, { kind: "end-voyage" }); // either Player may
  expect(res.status).toBe(200);
  for (const who of [host, partner]) {
    const listed = await list(who.cookie);
    expect(listed.finished.map(({ id, ship, outcome }) => ({ id, ship, outcome }))).toEqual([
      { id: voyage.id, ship: voyage.ship, outcome: "abandoned" },
    ]);
    expect(listed.unfinished.map((v) => v.id)).not.toContain(voyage.id);
  }
  const after = await list(host.cookie);
  expect(after.unfinished.find((v) => v.id === other.id)).toEqual(before.unfinished.find((v) => v.id === other.id));
  expect((await snapshot(server.url, voyage.id, host.cookie)).ended).toBe(true);
});

it("an ended Voyage takes no more intents (409), and a stranger cannot end it (403)", async () => {
  const { voyage, host } = await lobby(server.url);
  const stranger = await guest(server.url);
  expect((await post(server.url, `/api/voyages/${voyage.id}/intents`, stranger.cookie, { kind: "end-voyage", seq: 0 })).status).toBe(403);
  expect((await intent(server.url, voyage.id, host, { kind: "end-voyage" })).status).toBe(200);
  const again = await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck", seq: 99 });
  expect(again.status).toBe(409);
  expect((await intent(server.url, voyage.id, host, { kind: "end-voyage", seq: 99 })).status).toBe(409);
});

it("ending a Voyage is logged against the Voyage and the Person", async () => {
  const { voyage, host } = await lobby(server.url);
  await intent(server.url, voyage.id, host, { kind: "end-voyage" });
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT actor FROM event WHERE voyage_id = ? AND action = 'voyage.ended'").all(voyage.id) as { actor: string }[];
  db.close();
  expect(rows).toEqual([{ actor: host.id }]);
});
