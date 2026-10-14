import { expect, inject, it } from "vitest";
import { openSse, parseFrame } from "./helpers/sse.ts";

const baseUrl = inject("baseUrl");
const url = (path: string): URL => new URL(path, baseUrl);

async function guest(): Promise<{ cookie: string; id: string; name: string }> {
  const res = await fetch(url("/api/guest"), { method: "POST" });
  const { id, name } = (await res.json()) as { id: string; name: string };
  return { cookie: res.headers.getSetCookie()[0].split(";")[0], id, name };
}

const send = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(url(path), {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it("a new Guest has an 'Adjective Bird' Player name", async () => {
  expect((await guest()).name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

it("PUT /api/me/name sanitises, stores and returns the name", async () => {
  const g = await guest();
  const res = await send("PUT", "/api/me/name", g.cookie, { name: "  <Sam>​  " });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { name: string }).name).toBe("<Sam>");
  const me = (await (await fetch(url("/api/me"), { headers: { cookie: g.cookie } })).json()) as { name: string };
  expect(me.name).toBe("<Sam>");
});

it("a blocklisted or empty name is a 400 and changes nothing", async () => {
  const g = await guest();
  expect((await send("PUT", "/api/me/name", g.cookie, { name: "fuck" })).status).toBe(400);
  expect((await send("PUT", "/api/me/name", g.cookie, { name: " ​ " })).status).toBe(400);
  expect((await send("PUT", "/api/me/name", g.cookie, { name: 5 })).status).toBe(400);
  const me = (await (await fetch(url("/api/me"), { headers: { cookie: g.cookie } })).json()) as { name: string };
  expect(me.name).toBe(g.name);
});

it("renaming needs a session", async () => {
  const res = await fetch(url("/api/me/name"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sam" }),
  });
  expect(res.status).toBe(401);
});

it("a rename reaches the partner's lobby live", async () => {
  const host = await guest();
  const voyage = (await (await send("POST", "/api/voyages", host.cookie)).json()) as { id: string; code: string };
  const partner = await guest();
  await send("POST", "/api/join", partner.cookie, { code: voyage.code });

  const { stream } = await openSse(url(`/api/voyages/${voyage.id}/events`), host.cookie);
  parseFrame(await stream.next());
  await send("PUT", "/api/me/name", partner.cookie, { name: "Salty Sam" });
  const pushed = parseFrame(await stream.next(1500)).data as { players: { id: string; name: string }[] };
  expect(pushed.players.find((p) => p.id === partner.id)?.name).toBe("Salty Sam");
  stream.close();
});
