import { expect, inject, it } from "vitest";
import type { Banner, VoyageView } from "../shared/lobby.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";
import { intent, lobby, post, type Sailor } from "./helpers/voyage.ts";

// "Sail again with <partner>" (#61, #37): a new lobby for the same two Persons,
// and a banner on the partner's profile that takes them to it.
const base = inject("baseUrl");

const get = (path: string, who: Sailor) => fetch(new URL(path, base), { headers: { cookie: who.cookie } });
const banners = async (who: Sailor): Promise<Banner[]> => (await (await get("/api/banners", who)).json()) as Banner[];
const sailAgain = (voyageId: string, who: Sailor) => post(base, `/api/voyages/${voyageId}/sail-again`, who.cookie, {});
const finished = async () => {
  const l = await lobby(base);
  expect((await intent(base, l.voyage.id, l.host, { kind: "end-voyage" })).status).toBe(200);
  return l;
};

it("is refused while the Voyage is live (409), to a stranger (403) and to the anonymous (401)", async () => {
  const { voyage, host } = await lobby(base);
  expect((await sailAgain(voyage.id, host)).status).toBe(409);
  const { host: stranger } = await lobby(base);
  expect((await sailAgain(voyage.id, stranger)).status).toBe(403);
  expect((await post(base, `/api/voyages/${voyage.id}/sail-again`, null, {})).status).toBe(401);
});

it("opens a new lobby and puts a banner on the partner's profile, live; following it seats the partner", async () => {
  const { voyage, host, partner } = await finished();
  expect(await banners(partner)).toEqual([]);
  const { status, stream } = await openSse(new URL("/api/me/events", base), partner.cookie);
  expect(status).toBe(200);
  expect(parseFrame(await stream.next()).event).toBe("banners"); // the first frame is the current state

  const res = await sailAgain(voyage.id, host);
  expect(res.status).toBe(200);
  const fresh = (await res.json()) as VoyageView;
  expect(fresh.id).not.toBe(voyage.id);

  const live = parseFrame(await stream.next(10_000));
  expect(live.event).toBe("banners");
  expect((live.data as Banner[]).map((b) => [b.from, b.voyage.id])).toEqual([[host.name, fresh.id]]);
  expect((await banners(host)).length).toBe(0); // the banner is for the partner only

  const joined = await post(base, "/api/join", partner.cookie, { key: fresh.link.replace("/v/", "") });
  expect(joined.status).toBe(200);
  expect(((await joined.json()) as VoyageView).id).toBe(fresh.id);
  expect(await banners(partner)).toEqual([]); // seated, so nothing left to follow
  stream.close();
});

it("is one tap for each Player: both taps land in the same new Voyage", async () => {
  const { voyage, host, partner } = await finished();
  const a = (await (await sailAgain(voyage.id, host)).json()) as VoyageView;
  const again = (await (await sailAgain(voyage.id, host)).json()) as VoyageView;
  expect(again.id).toBe(a.id); // a second tap by the same Player opens nothing new
  const b = (await (await sailAgain(voyage.id, partner)).json()) as VoyageView;
  expect(b.id).toBe(a.id);
  expect(await banners(partner)).toEqual([]);
  const mine = (await (await get("/api/voyages", partner)).json()) as { unfinished: { id: string }[] };
  expect(mine.unfinished.map((v) => v.id)).toEqual([a.id]);
});
