import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { intent, snapshot, underway } from "./helpers/voyage.ts";

let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

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

it("an examine goes through the intent pipeline, is logged with the thing, and is never a Strike", async () => {
  const { voyage, host } = await underway(server.url);
  const before = await snapshot(server.url, voyage.id, host.cookie);
  const res = await intent(server.url, voyage.id, host, { kind: "examine", thing: "brass-barometer" });
  expect(res.status).toBe(200);
  const after = await snapshot(server.url, voyage.id, host.cookie);
  expect(after.draw!.strikes).toBe(before.draw!.strikes);
  const logged = events(voyage.id).filter((e) => e.action === "intent.examine");
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBe(host.id);
  expect(JSON.parse(logged[0].detail)).toEqual({ thing: "brass-barometer" });
  expect(events(voyage.id).some((e) => e.action === "strike")).toBe(false);
});

it("refuses an examine of a thing that is not in the Player's own Room", async () => {
  const { voyage, host } = await underway(server.url);
  expect((await intent(server.url, voyage.id, host, { kind: "examine", thing: "coal-crate" })).status).toBe(400);
  expect((await intent(server.url, voyage.id, host, { kind: "examine", thing: "nothing-here" })).status).toBe(400);
});
