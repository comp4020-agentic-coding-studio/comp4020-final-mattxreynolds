import { expect, inject, it } from "vitest";
import { openSse, parseFrame } from "./helpers/sse.ts";

const baseUrl = inject("baseUrl");
const url = (path: string): URL => new URL(path, baseUrl);

it("'Play as guest' sets an httpOnly session cookie and returns the Person for the profile screen", async () => {
  const res = await fetch(url("/api/guest"), { method: "POST" });
  expect(res.status).toBe(200);

  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("session="));
  expect(cookie, "a session cookie").toBeDefined();
  expect(cookie).toMatch(/;\s*HttpOnly/i);
  expect(cookie).toMatch(/;\s*SameSite=Lax/i);

  const person = (await res.json()) as { id: string; name: string };
  expect(person.id).toMatch(/^p_[0-9a-f]{4,}$/);
  expect(person.name.length).toBeGreaterThan(0);

  const me = await fetch(url("/api/me"), { headers: { cookie: cookie!.split(";")[0] } });
  expect(me.status).toBe(200);
  expect(await me.json()).toEqual(person);
});

it("/api/me is 401 without a session", async () => {
  expect((await fetch(url("/api/me"))).status).toBe(401);
});

async function guest(): Promise<{ cookie: string; id: string }> {
  const res = await fetch(url("/api/guest"), { method: "POST" });
  const { id } = (await res.json()) as { id: string };
  return { cookie: res.headers.getSetCookie()[0].split(";")[0], id };
}

const post = (path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(url(path), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

interface Started {
  id: string;
  ship: string;
  link: string;
  code: string;
}

interface Snapshot {
  voyage: Started;
  you: { id: string; name: string };
  players: { id: string; name: string }[];
  decks: { deck: string; player: string | null }[];
}

it("each SSE connection opens with a full snapshot, and the lobby is live when a partner joins", async () => {
  const host = await guest();
  const voyage = (await (await post("/api/voyages", host.cookie)).json()) as Started;
  const { status, stream } = await openSse(url(`/api/voyages/${voyage.id}/events`), host.cookie);
  expect(status).toBe(200);

  const first = parseFrame(await stream.next());
  expect(first.event).toBe("snapshot");
  const snap = first.data as Snapshot;
  expect(snap.voyage).toEqual(voyage);
  expect(snap.you.id).toBe(host.id);
  expect(snap.players.map((p) => p.id)).toEqual([host.id]);
  expect(snap.decks.map((d) => d.deck).sort()).toEqual(["Lower Deck", "Upper Deck"]);
  expect(snap.decks.every((d) => d.player === null)).toBe(true);

  const partner = await guest();
  await post("/api/join", partner.cookie, { code: voyage.code });
  const pushed = parseFrame(await stream.next(1500)).data as Snapshot;
  expect(pushed.players.map((p) => p.id).sort()).toEqual([host.id, partner.id].sort());

  // a reconnect starts again from a full snapshot
  stream.close();
  const again = await openSse(url(`/api/voyages/${voyage.id}/events`), partner.cookie);
  expect(parseFrame(await again.stream.next()).event).toBe("snapshot");
  again.stream.close();
});

it("the stream refuses a stranger (401) and a Person who is not seated (403)", async () => {
  const host = await guest();
  const voyage = (await (await post("/api/voyages", host.cookie)).json()) as Started;
  const eventsUrl = url(`/api/voyages/${voyage.id}/events`);
  expect((await fetch(eventsUrl)).status).toBe(401);
  expect((await fetch(eventsUrl, { headers: { cookie: (await guest()).cookie } })).status).toBe(403);
});

it("a heartbeat comment follows every 15 s", { timeout: 40_000 }, async () => {
  const host = await guest();
  const voyage = (await (await post("/api/voyages", host.cookie)).json()) as Started;
  const { stream } = await openSse(url(`/api/voyages/${voyage.id}/events`), host.cookie);
  await stream.next(); // snapshot
  const started = Date.now();
  const beat = await stream.next(17_000);
  const waited = Date.now() - started;
  expect(beat).toMatch(/^:/);
  expect(waited).toBeGreaterThan(13_000);
  expect(waited).toBeLessThan(17_000);
  stream.close();
});

it("starting a Voyage gives a ship name, a link and a code; the link and the code reach the same lobby", async () => {
  const host = await guest();
  const res = await post("/api/voyages", host.cookie);
  expect(res.status).toBe(200);
  const voyage = (await res.json()) as Started;
  expect(voyage.ship.length).toBeGreaterThan(0);
  expect(voyage.code).toMatch(/^SS-[A-Z]+-\d{4}$/);

  // the link is a page on this origin that serves the app, so it opens the lobby directly
  const page = await fetch(new URL(voyage.link, baseUrl));
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toMatch(/text\/html/);

  // a partner arriving by the link's key
  const byLink = await guest();
  const key = new URL(voyage.link, baseUrl).pathname.split("/").pop();
  const joinedByLink = await post("/api/join", byLink.cookie, { key });
  expect(joinedByLink.status).toBe(200);
  expect(((await joinedByLink.json()) as Started).id).toBe(voyage.id);

  // a partner typing the code on a phone, into a second Voyage so it is a separate join
  const second = (await (await post("/api/voyages", host.cookie)).json()) as Started;
  const byCode = await guest();
  const joinedByCode = await post("/api/join", byCode.cookie, { code: second.code.toLowerCase() });
  expect(joinedByCode.status).toBe(200);
  expect(((await joinedByCode.json()) as Started).id).toBe(second.id);

  expect((await post("/api/join", (await guest()).cookie, { code: "SS-NOPE-0000" })).status).toBe(404);
  expect((await post("/api/voyages", "")).status).toBe(401);
});
