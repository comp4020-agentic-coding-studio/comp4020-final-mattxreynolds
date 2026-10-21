// Promise: the public pages work without client JavaScript. /readme/ and
// /history/ are complete server-rendered HTML, callsigns are escaped, unknown
// paths get a real 404 page, and join links serve the game shell. Runs against
// the main app (the production image in CI).

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, inject, it } from "vitest";
import { connectPlayer, launch, post, type Player } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
let open: Player[] = [];
afterEach(() => {
  open.forEach((p) => p.close());
  open = [];
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, baseUrl), init);

describe("/readme/ is server-rendered from README.md", () => {
  it("serves complete HTML with the README's title, and links back to the game", async () => {
    const res = await get("/readme/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/i);
    const title = readFileSync("README.md", "utf8").match(/^#\s+(.+)$/m)![1].trim();
    expect(html).toContain(title);
    expect(html).toMatch(/<a [^>]*href="\/"/);
    // no client bundle is needed to read it
    expect(html).not.toMatch(/<script[^>]*src=/);
  });

  it("/readme redirects to /readme/", async () => {
    const res = await get("/readme", { redirect: "manual" });
    expect([301, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/readme/");
  });
});

describe("/history/ is the server-rendered Ship's Log", () => {
  it("serves complete HTML with the log's heading, stats and a way back", async () => {
    const res = await get("/history/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("Ship's Log");
    expect(html).toContain("voyages ended");
    expect(html).toMatch(/<a [^>]*href="\/"/);
    expect(html).not.toMatch(/<script[^>]*src=/);
  });

  it("/history redirects to /history/", async () => {
    const res = await get("/history", { redirect: "manual" });
    expect([301, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/history/");
  });

  it("escapes callsigns (O'NEIL appears HTML-escaped, never raw)", async () => {
    const players = await launch(baseUrl, ["O'NEIL", "D'ARCY"]);
    open.push(...players);
    const code = players[0].code;
    const html = await (await get("/history/")).text();
    const tr = html.match(new RegExp(`<tr data-code="${code}">([\\s\\S]*?)</tr>`))?.[1];
    expect(tr, "started voyage missing from /history/").toBeTruthy();
    expect(tr).toContain("O&#39;NEIL");
    expect(tr).toContain("D&#39;ARCY");
    expect(tr).not.toContain("O'NEIL");
    // and the JSON API reports the plain callsign
    const api = await (await get("/api/history")).json();
    expect(api.voyages.find((r: { code: string }) => r.code === code)).toMatchObject({
      engineer: "O'NEIL",
      navigator: "D'ARCY",
    });
  });

  it("never shows a seat token", async () => {
    const players = await launch(baseUrl, ["TOKA", "TOKB"]);
    open.push(...players);
    const html = await (await get("/history/")).text();
    const api = await (await get("/api/history")).text();
    for (const p of players) {
      expect(html).not.toContain(p.token);
      expect(api).not.toContain(p.token);
    }
  });
});

describe("health and errors", () => {
  it("/healthz is 200 JSON", async () => {
    const res = await get("/healthz");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("an unknown path is a 404 HTML page, not a stack trace", async () => {
    const res = await get("/no/such/place");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toMatch(/<a [^>]*href="\/"/);
    expect(html).not.toMatch(/at \w+ \(|node_modules|Error:/);
  });

  it("an unknown API voyage is a JSON 404", async () => {
    const res = await get("/api/voyages/ZZZZ");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not-found" });
  });
});

describe("join links serve the game", () => {
  it("/v/ABCD serves the SPA shell (200 HTML)", async () => {
    const res = await get("/v/ABCD");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).toMatch(/<script[^>]*type="module"/);
  });

  it("/ serves the same shell", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it("peeking a voyage reveals only code, phase and crew", async () => {
    const a = await post(baseUrl, "/api/voyages", { callsign: "PEEK" });
    open.push(await connectPlayer(baseUrl, a.json));
    const res = await get(`/api/voyages/${a.json.code.toLowerCase()}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ code: a.json.code, phase: "LOBBY", crew: [{ role: "ENGINEER", callsign: "PEEK" }] });
  });
});
