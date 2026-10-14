import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { type SecondServer, startSecondServer } from "./helpers/second-server.ts";
import { guest, intent, lobby, post, snapshot } from "./helpers/voyage.ts";

// A second server, so refusals can be read back from its events table.
let server: SecondServer;
beforeAll(async () => {
  server = await startSecondServer();
});
afterAll(async () => {
  await server.stop();
});

interface Refusal {
  actor: string | null;
  voyage_id: string | null;
  detail: Record<string, unknown>;
}

function refusals(): Refusal[] {
  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db
    .prepare("SELECT actor, voyage_id, detail FROM event WHERE action = 'intent.refused' ORDER BY id")
    .all() as { actor: string | null; voyage_id: string | null; detail: string }[];
  db.close();
  return rows.map((r) => ({ ...r, detail: JSON.parse(r.detail) as Record<string, unknown> }));
}

it("a Player takes a Deck, and the other Player's Deck card shows who holds it and that they are connected", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  const { stream } = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), host.cookie);
  await stream.next(); // the host's own stream stays open, so the host is connected
  const res = await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  expect(res.status).toBe(200);
  const snap = await snapshot(server.url, voyage.id, partner.cookie);
  const upper = snap.decks.find((d) => d.deck === "Upper Deck")!;
  expect(upper.player).toEqual({ id: host.id, name: host.name });
  expect(upper.connected).toBe(true);
  expect(snap.decks.find((d) => d.deck === "Lower Deck")!.player).toBeNull();
  stream.close();
});

it("a Player can switch to the other empty Deck before cast off", async () => {
  const { voyage, host } = await lobby(server.url);
  await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  expect((await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Lower Deck" })).status).toBe(200);
  const snap = await snapshot(server.url, voyage.id, host.cookie);
  expect(snap.decks.find((d) => d.deck === "Upper Deck")!.player).toBeNull();
  expect(snap.decks.find((d) => d.deck === "Lower Deck")!.player?.id).toBe(host.id);
});

it("refuses in order: 401, 403 not seated, 403 not your Deck, 409, 400, each logged with its reason", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  const stranger = await guest(server.url);
  const path = `/api/voyages/${voyage.id}/intents`;
  await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  const seq = (await snapshot(server.url, voyage.id, host.cookie)).seq;
  const before = refusals().length;

  // each refusal below also trips every later check, so it proves the order
  expect((await post(server.url, path, null, "not json")).status).toBe(401);
  expect((await post(server.url, path, stranger.cookie, { kind: "nope", seq: 0 })).status).toBe(403);
  expect((await post(server.url, path, host.cookie, { kind: "cast-off", deck: "Lower Deck", seq: seq - 1 })).status).toBe(403);
  expect((await post(server.url, path, host.cookie, { kind: "choose-deck", deck: "Poop Deck", seq: seq - 1 })).status).toBe(409);
  expect((await intent(server.url, voyage.id, partner, { kind: "choose-deck", deck: "Upper Deck" })).status).toBe(409);
  expect((await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Poop Deck" })).status).toBe(400);
  expect((await post(server.url, path, host.cookie, "not json")).status).toBe(400);

  const logged = refusals().slice(before);
  expect(logged.map((r) => r.detail.reason)).toEqual([
    "no session",
    "not seated",
    "not your Deck",
    "stale",
    "deck taken",
    "bad body",
    "bad body",
  ]);
  expect(logged.map((r) => r.detail.status)).toEqual([401, 403, 403, 409, 409, 400, 400]);
  expect(logged[2].actor).toBe(host.id);
  expect(logged[2].voyage_id).toBe(voyage.id);
});

it("a Person holds one Deck per Voyage across browsers", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  // the same Person in a second browser reads the same Deck, so cannot also take the other
  expect((await snapshot(server.url, voyage.id, host.cookie)).yourDeck).toBe("Upper Deck");
  const res = await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  expect(res.status).toBe(200); // choosing the Deck already held changes nothing
  const snap = await snapshot(server.url, voyage.id, host.cookie);
  expect(snap.decks.filter((d) => d.player?.id === host.id)).toHaveLength(1);
  expect(snap.decks.find((d) => d.deck === "Lower Deck")!.player).toBeNull();
  expect((await snapshot(server.url, voyage.id, partner.cookie)).yourDeck).toBeNull();
});

it("the same-Deck race: the first accepted choice wins, the loser gets a logged 409", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  const seq = (await snapshot(server.url, voyage.id, host.cookie)).seq;
  const before = refusals().length;
  const [a, b] = await Promise.all([
    post(server.url, `/api/voyages/${voyage.id}/intents`, host.cookie, { kind: "choose-deck", deck: "Lower Deck", seq }),
    post(server.url, `/api/voyages/${voyage.id}/intents`, partner.cookie, { kind: "choose-deck", deck: "Lower Deck", seq }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  const winner = a.status === 200 ? host : partner;
  const loser = winner === host ? partner : host;
  const snap = await snapshot(server.url, voyage.id, loser.cookie);
  expect(snap.decks.find((d) => d.deck === "Lower Deck")!.player?.id).toBe(winner.id);
  const loss = refusals().slice(before);
  expect(loss).toHaveLength(1);
  expect(loss[0].actor).toBe(loser.id);
  expect(loss[0].detail.status).toBe(409);
  // the loser is told plainly, and offered the other Deck
  const body = (await (winner === host ? b : a).json()) as { error: string; offer?: string };
  expect(body.error).toMatch(/taken/i);
  expect(body.offer).toBe("Upper Deck");
});

it("the Voyage does not start until both Players have pressed Cast off", async () => {
  const { voyage, host, partner } = await lobby(server.url);
  // casting off needs a Deck first
  expect((await intent(server.url, voyage.id, host, { kind: "cast-off" })).status).toBe(409);
  await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  await intent(server.url, voyage.id, partner, { kind: "choose-deck", deck: "Lower Deck" });

  expect((await intent(server.url, voyage.id, host, { kind: "cast-off" })).status).toBe(200);
  let snap = await snapshot(server.url, voyage.id, host.cookie);
  expect(snap.started).toBe(false);
  expect(snap.decks.find((d) => d.deck === "Upper Deck")!.castOff).toBe(true);
  // once cast off, the Deck is locked in
  expect((await intent(server.url, voyage.id, host, { kind: "choose-deck", deck: "Lower Deck" })).status).toBe(409);

  expect((await intent(server.url, voyage.id, partner, { kind: "cast-off" })).status).toBe(200);
  snap = await snapshot(server.url, voyage.id, partner.cookie);
  expect(snap.started).toBe(true);
  expect(snap.yourDeck).toBe("Lower Deck");
});
