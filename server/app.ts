import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createGuest, personForToken, type Person } from "./people.ts";
import { logEvent } from "./events.ts";
import { publish, seatedPlayers, snapshotFor, subscribe, voyageById } from "./lobby.ts";
import { joinVoyage, startVoyage } from "./voyages.ts";

const COOKIE = "session";
const HEARTBEAT_MS = 15_000; // ADR 0004
const YEAR =60 * 60 * 24 * 365;

type Env = { Variables: { person: Person } };

export function createApi(db: DatabaseSync): Hono<Env> {
  const api = new Hono<Env>();

  const issue = (c: Context, token: string): void => {
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: YEAR,
      secure: c.req.header("x-forwarded-proto") === "https",
    });
  };

  api.post("/guest", (c) => {
    const { person, token } = createGuest(db);
    issue(c, token);
    logEvent(db, { actor: person.id, actorName: person.name, action: "guest.created" });
    return c.json(person);
  });

  // the refusal order starts here: a known Person, or 401
  api.use("*", async (c, next) => {
    const token = getCookie(c, COOKIE);
    const person = personForToken(db, token);
    if (!person) {
      if (token) deleteCookie(c, COOKIE, { path: "/" });
      return c.json({ error: "no session" }, 401);
    }
    issue(c, token!); // rolling: each visit renews the year
    c.set("person", person);
    await next();
  });

  api.get("/me", (c) => c.json(c.get("person")));

  api.post("/voyages", (c) => {
    const you = c.get("person");
    const voyage = startVoyage(db, you.id);
    logEvent(db, { voyageId: voyage.id, actor: you.id, actorName: you.name, action: "voyage.started", detail: { ship: voyage.ship } });
    return c.json(voyage);
  });

  api.post("/join", async (c) => {
    const you = c.get("person");
    const who = { actor: you.id, actorName: you.name };
    const body = (await c.req.json().catch(() => null)) as { key?: unknown; code?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key : undefined;
    const code = typeof body?.code === "string" ? body.code : undefined;
    // the key and the code are secrets, so a refusal logs only its reason
    if (!key && !code) {
      logEvent(db, { ...who, action: "join.refused", detail: { reason: "malformed" } });
      return c.json({ error: "give a link key or a code" }, 400);
    }
    const via = key ? "link" : "code";
    const result = joinVoyage(db, you.id, { key, code });
    if (result === "unknown") {
      logEvent(db, { ...who, action: "join.refused", detail: { via, reason: "unknown voyage" } });
      return c.json({ error: "no such Voyage" }, 404);
    }
    if (result === "full") {
      logEvent(db, { ...who, action: "join.refused", detail: { via, reason: "voyage full" } });
      return c.json({ error: "this Voyage already has two Players" }, 409);
    }
    if (result.newlySeated) {
      logEvent(db, { ...who, voyageId: result.voyage.id, action: "voyage.joined", detail: { via } });
      publish(result.voyage.id);
    }
    return c.json(result.voyage);
  });

  api.get("/voyages/:id/events", (c) => {
    const you = c.get("person");
    const voyage = voyageById(db, c.req.param("id"));
    // 403 (not seated) for a Voyage that doesn't exist too, so ids can't be probed
    if (!voyage || !seatedPlayers(db, voyage.id).some((p) => p.id === you.id)) {
      logEvent(db, { actor: you.id, actorName: you.name, action: "stream.refused", detail: { reason: "not seated" } });
      return c.json({ error: "not seated in this Voyage" }, 403);
    }
    const who = { voyageId: voyage.id, actor: you.id, actorName: you.name };
    return streamSSE(c, async (stream) => {
      logEvent(db, { ...who, action: "stream.connected" });
      const send = (): Promise<void> =>
        stream.writeSSE({ event: "snapshot", data: JSON.stringify(snapshotFor(db, voyage, you)) });
      await send(); // the first event on every connection is the full state
      const unsubscribe = subscribe(voyage.id, () => void send());
      const beat = setInterval(() => void stream.write(": heartbeat\n\n"), HEARTBEAT_MS);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      unsubscribe();
      logEvent(db, { ...who, action: "stream.closed" });
    });
  });

  return api;
}
