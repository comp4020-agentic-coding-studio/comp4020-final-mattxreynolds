import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { openSse, parseFrame } from "./helpers/sse.ts";

interface Started {
  id: string;
  ship: string;
  link: string;
  code: string;
}

async function guest(base: string): Promise<{ cookie: string; token: string; id: string; name: string }> {
  const res = await fetch(new URL("/api/guest", base), { method: "POST" });
  const person = (await res.json()) as { id: string; name: string };
  const pair = res.headers.getSetCookie()[0].split(";")[0];
  return { cookie: pair, token: pair.split("=")[1], ...person };
}

const post = (base: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(new URL(path, base), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it("writes each event to SQLite and to one stdout line, with no token or Voyage code in either", async () => {
  const server = await startSecondServer();
  const host = await guest(server.url);
  const voyage = (await (await post(server.url, "/api/voyages", host.cookie)).json()) as Started;
  const partner = await guest(server.url);
  await post(server.url, "/api/join", partner.cookie, { code: voyage.code });
  const { stream } = await openSse(new URL(`/api/voyages/${voyage.id}/events`, server.url), partner.cookie);
  await stream.next();
  stream.close();
  // a refusal is logged too, and the code typed into it must not leak
  await post(server.url, "/api/join", (await guest(server.url)).cookie, { code: "SS-WRONG-0000" });
  await server.stop();

  const linkKey = voyage.link.split("/").pop()!;
  const secrets = [host.token, partner.token, voyage.code, "SS-WRONG-0000", linkKey];

  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT actor, voyage_id, action, detail FROM event ORDER BY id").all() as {
    actor: string | null;
    voyage_id: string | null;
    action: string;
    detail: string;
  }[];
  db.close();

  // something is recorded for each action
  const actions = rows.map((r) => r.action);
  for (const wanted of ["guest.created", "voyage.started", "voyage.joined", "stream.connected", "join.refused"]) {
    expect(actions, `an event for ${wanted}`).toContain(wanted);
  }
  const started = rows.find((r) => r.action === "voyage.started")!;
  expect(started.actor).toBe(host.id);
  expect(started.voyage_id).toBe(voyage.id);

  const stdout = server.output();
  const lines = stdout.split("\n").filter((l) => l.includes("voyage.started"));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(host.id);
  expect(lines[0]).toContain(`"${host.name}"`);

  const dump = JSON.stringify(rows);
  for (const secret of secrets) {
    expect(dump, "events table").not.toContain(secret);
    expect(stdout, "stdout").not.toContain(secret);
  }
});

it("the lobby is still there after a restart", async () => {
  const first = await startSecondServer();
  const host = await guest(first.url);
  const voyage = (await (await post(first.url, "/api/voyages", host.cookie)).json()) as Started;
  const partner = await guest(first.url);
  await post(first.url, "/api/join", partner.cookie, { key: voyage.link.split("/").pop() });
  expect(await first.stop()).toBe(0);

  const second = await startSecondServer({ dataDir: first.dataDir });
  // the same cookie still names the same Person, and the same code reaches the same lobby
  const me = await fetch(new URL("/api/me", second.url), { headers: { cookie: host.cookie } });
  expect(((await me.json()) as { id: string }).id).toBe(host.id);

  const { status, stream } = await openSse(new URL(`/api/voyages/${voyage.id}/events`, second.url), host.cookie);
  expect(status).toBe(200);
  const snap = parseFrame(await stream.next()).data as { voyage: Started; players: { id: string }[] };
  expect(snap.voyage).toEqual(voyage);
  expect(snap.players.map((p) => p.id).sort()).toEqual([host.id, partner.id].sort());
  stream.close();

  const byCode = await post(second.url, "/api/join", (await guest(second.url)).cookie, { code: voyage.code });
  expect(byCode.status).toBe(409); // already two Players, so the code reaches the lobby but it is full
  await second.stop();
});
