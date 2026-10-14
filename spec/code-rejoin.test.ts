import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { expect, inject, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { openSse } from "./helpers/sse.ts";
import { guest, intent, lobby, post, type Sailor, type Started } from "./helpers/voyage.ts";

const baseUrl = inject("baseUrl");

/** A Voyage where the host holds the Upper Deck and the partner the Lower, with only the host connected. */
async function hostOnline(base: string): Promise<{
  voyage: Started;
  host: Sailor;
  partner: Sailor;
  close: () => void;
}> {
  const { voyage, host, partner } = await lobby(base);
  await intent(base, voyage.id, host, { kind: "choose-deck", deck: "Upper Deck" });
  await intent(base, voyage.id, partner, { kind: "choose-deck", deck: "Lower Deck" });
  const { stream } = await openSse(new URL(`/api/voyages/${voyage.id}/events`, base), host.cookie);
  await stream.next();
  return { voyage, host, partner, close: () => stream.close() };
}

const me = async (base: string, cookie: string): Promise<{ id: string }> =>
  (await fetch(new URL("/api/me", base), { headers: { cookie } })).json() as Promise<{ id: string }>;

it("a fresh browser with only the code is offered the Deck whose Player isn't connected, and no other", async () => {
  const { voyage, partner, close } = await hostOnline(baseUrl);
  const fresh = await guest(baseUrl);
  const res = await post(baseUrl, "/api/rejoin/offers", fresh.cookie, { code: voyage.code });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ offers: [{ deck: "Lower Deck", playerName: partner.name }] });
  close();
});

it("taking the offer attaches the fresh browser's session to that Person, who is then back in the Voyage", async () => {
  const { voyage, partner, close } = await hostOnline(baseUrl);
  const fresh = await guest(baseUrl);
  const res = await post(baseUrl, "/api/rejoin", fresh.cookie, { code: voyage.code, deck: "Lower Deck" });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { voyage: Started }).voyage.id).toBe(voyage.id);

  expect((await me(baseUrl, fresh.cookie)).id).toBe(partner.id);
  const { status, stream } = await openSse(new URL(`/api/voyages/${voyage.id}/events`, baseUrl), fresh.cookie);
  expect(status).toBe(200);
  stream.close();
  close();
});

it("can't take a Deck whose Player is connected", async () => {
  const { voyage, host, close } = await hostOnline(baseUrl);
  const fresh = await guest(baseUrl);
  const res = await post(baseUrl, "/api/rejoin", fresh.cookie, { code: voyage.code, deck: "Upper Deck" });
  expect(res.status).toBe(409);
  expect((await me(baseUrl, fresh.cookie)).id).not.toBe(host.id);
  close();
});

it("refuses an unknown code, a malformed body and no session", async () => {
  const fresh = await guest(baseUrl);
  expect((await post(baseUrl, "/api/rejoin/offers", fresh.cookie, { code: "SS-NOPE-0000" })).status).toBe(404);
  expect((await post(baseUrl, "/api/rejoin", fresh.cookie, { code: "SS-NOPE-0000", deck: "Lower Deck" })).status).toBe(404);
  expect((await post(baseUrl, "/api/rejoin", fresh.cookie, { deck: 7 })).status).toBe(400);
  expect((await post(baseUrl, "/api/rejoin", null, { code: "SS-NOPE-0000", deck: "Lower Deck" })).status).toBe(401);
});

it("logs each attempt and its outcome, and the Voyage code appears nowhere in the log", async () => {
  const server = await startSecondServer();
  const { voyage, partner, close } = await hostOnline(server.url);
  const fresh = await guest(server.url);
  await post(server.url, "/api/rejoin", fresh.cookie, { code: voyage.code, deck: "Upper Deck" }); // connected: refused
  await post(server.url, "/api/rejoin", fresh.cookie, { code: "SS-WRONG-0000", deck: "Lower Deck" }); // unknown: refused
  await post(server.url, "/api/rejoin", fresh.cookie, { code: voyage.code, deck: "Lower Deck" }); // accepted
  close();
  await server.stop();

  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT actor, voyage_id, action, detail FROM event ORDER BY id").all() as {
    actor: string | null;
    voyage_id: string | null;
    action: string;
    detail: string;
  }[];
  db.close();
  expect(rows.filter((r) => r.action === "rejoin.refused")).toHaveLength(2);
  const done = rows.find((r) => r.action === "voyage.rejoined")!;
  expect(done.voyage_id).toBe(voyage.id);
  expect(done.actor).toBe(partner.id);

  const dump = JSON.stringify(rows);
  for (const secret of [voyage.code, "SS-WRONG-0000", fresh.cookie.split("=")[1]]) {
    expect(dump, "events table").not.toContain(secret);
    expect(server.output(), "stdout").not.toContain(secret);
  }
});

it("in an incognito-style window, typing the code offers 'Rejoin as <name> (<Deck>)' and lands back in the Voyage", async () => {
  const { voyage, partner, close } = await hostOnline(baseUrl);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Play as guest" }).click();
    await page.getByLabel("Voyage code").fill(voyage.code);
    await page.getByRole("button", { name: "Join" }).click();
    await page.getByRole("button", { name: `Rejoin as ${partner.name} (Lower Deck)` }).click();
    await page.getByTestId("ship-name").waitFor();
    expect(await page.getByTestId("ship-name").innerText()).toBe(voyage.ship);
    expect(await page.getByTestId("player").allInnerTexts()).toContain(`${partner.name} (you)`);
  } finally {
    await browser.close();
    close();
  }
});
