import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createGuest, endSession, personForToken, recordSignInFailure, renamePerson, signIn, signInThrottled, upgradeToAccount, type Person } from "./people.ts";
import { sanitisePlayerName } from "./player-name.ts";
import type { Notice } from "../shared/draw.ts";
import { logEvent } from "./events.ts";
import { settleClock } from "./clock.ts";
import { debriefOf } from "./debrief.ts";
import { leaderboard, publishLeaderboard, setConsent, subscribeLeaderboard } from "./leaderboard.ts";
import { markConnected, publish, seatedPlayers, voyageIdsFor, snapshotFor, subscribe, voyageById, voyagesOf } from "./lobby.ts";
import { applyIntent } from "./intents.ts";
import { isLowTrustKind, saveLowTrust } from "./low-trust.ts";
import { withVoyage } from "./mutex.ts";
import { attachSession, offersFor } from "./rejoin.ts";
import { bannersFor, publishProfile, sailAgain, watchProfile } from "./sail-again.ts";
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

  // Sign-in is the one route that needs no session. The username is a
  // credential, so logs carry the public id of the Account only, never a
  // username or password.
  api.post("/signin", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.slice(0, 64) : "";
    if (signInThrottled(username)) {
      logEvent(db, { action: "signin.refused", detail: { reason: "throttled", status: 429 } });
      return c.json({ error: "too many attempts, wait a minute" }, 429);
    }
    const found = await signIn(db, username, body?.password);
    if (!found) {
      recordSignInFailure(username);
      logEvent(db, { action: "signin.failed", detail: { status: 401 } });
      return c.json({ error: "wrong username or password" }, 401);
    }
    issue(c, found.token);
    logEvent(db, { actor: found.person.id, actorName: found.person.name, action: "signin.ok" });
    return c.json(found.person);
  });

  // The Leaderboard is public: no session, and its payload holds only a rank,
  // two Player names and a Score (#67).
  api.get("/leaderboard", (c) => c.json(leaderboard(db)));
  api.get("/leaderboard/events", (c) =>
    streamSSE(c, async (stream) => {
      const send = (): Promise<void> => stream.writeSSE({ event: "leaderboard", data: JSON.stringify(leaderboard(db)) });
      await send();
      const unsubscribe = subscribeLeaderboard(() => void send());
      const beat = setInterval(() => void stream.write(": heartbeat\n\n"), HEARTBEAT_MS);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      unsubscribe();
    }),
  );

  // the refusal order starts here: a known Person, or 401
  api.use("*", async (c, next) => {
    const token = getCookie(c, COOKIE);
    const person = personForToken(db, token);
    if (!person) {
      if (token) deleteCookie(c, COOKIE, { path: "/" });
      if (c.req.method === "POST" && c.req.path.endsWith("/intents")) {
        logEvent(db, { action: "intent.refused", detail: { reason: "no session", status: 401 } });
      }
      return c.json({ error: "no session" }, 401);
    }
    issue(c, token!); // rolling: each visit renews the year
    c.set("person", person);
    await next();
  });

  api.get("/me", (c) => c.json(c.get("person")));

  // A Guest becomes an Account in place, keeping the public id and history.
  api.post("/account", async (c) => {
    const you = c.get("person");
    const body = (await c.req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
    const result = await upgradeToAccount(db, you, body?.username, body?.password);
    if (!result.ok) {
      const status = result.reason === "invalid" ? 400 : 409;
      logEvent(db, { actor: you.id, actorName: you.name, action: "account.refused", detail: { reason: result.reason, status } });
      return c.json({ error: `account refused: ${result.reason}` }, status);
    }
    logEvent(db, { actor: you.id, actorName: you.name, action: "account.created" });
    return c.json(result.person);
  });

  // Ends only this browser's session; the Account's other sessions stay.
  api.post("/signout", (c) => {
    const you = c.get("person");
    endSession(db, getCookie(c, COOKIE)!);
    deleteCookie(c, COOKIE, { path: "/" });
    logEvent(db, { actor: you.id, actorName: you.name, action: "signout" });
    return c.json({ ok: true });
  });

  api.put("/me/name", async (c) => {
    const you = c.get("person");
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    const result = sanitisePlayerName(body?.name);
    if (!result.ok) {
      logEvent(db, { actor: you.id, actorName: you.name, action: "name.refused", detail: { reason: result.reason } });
      return c.json({ error: `name refused: ${result.reason}` }, 400);
    }
    renamePerson(db, you.id, result.name);
    logEvent(db, { actor: you.id, actorName: result.name, action: "name.changed" });
    for (const id of voyageIdsFor(db, you.id)) publish(id); // lobbies update live
    return c.json({ id: you.id, name: result.name });
  });

  api.get("/voyages", (c) => c.json(voyagesOf(db, c.get("person").id)));

  api.post("/voyages", (c) => {
    const you = c.get("person");
    const voyage = startVoyage(db, you.id);
    logEvent(db, { voyageId: voyage.id, actor: you.id, actorName: you.name, action: "voyage.started", detail: { ship: voyage.ship } });
    return c.json(voyage);
  });

  // Sail again: one tap each. The first opens the new lobby and banners the partner; the second boards it.
  api.post("/voyages/:id/sail-again", async (c) => {
    const you = c.get("person");
    const fromId = c.req.param("id");
    const result = await withVoyage(fromId, () => sailAgain(db, you.id, fromId));
    const who = { actor: you.id, actorName: you.name };
    if (typeof result === "string") {
      const status = result === "not seated" ? 403 : 409;
      logEvent(db, { ...who, action: "sail-again.refused", detail: { reason: result, status } });
      return c.json({ error: result === "live" ? "the Voyage is not over yet" : result === "full" ? "the new Voyage is full" : "not seated in this Voyage" }, status);
    }
    if (result.opened) {
      logEvent(db, { ...who, voyageId: result.voyage.id, action: "voyage.started", detail: { ship: result.voyage.ship, sail_again: true } });
      for (const p of seatedPlayers(db, fromId)) if (p.id !== you.id) publishProfile(p.id);
    } else {
      publish(result.voyage.id);
      publishProfile(you.id);
    }
    return c.json(result.voyage);
  });

  api.get("/banners", (c) => c.json(bannersFor(db, c.get("person").id)));

  // The profile's own stream: the banners, now and whenever they change.
  api.get("/me/events", (c) => {
    const you = c.get("person");
    return streamSSE(c, async (stream) => {
      const send = async (): Promise<void> => {
        await stream.writeSSE({ event: "banners", data: JSON.stringify(bannersFor(db, you.id)) });
      };
      await send();
      const unwatch = watchProfile(you.id, () => void send());
      const beat = setInterval(() => void stream.write(": heartbeat\n\n"), HEARTBEAT_MS);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      unwatch();
    });
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
      publishProfile(you.id); // a banner for this Voyage is answered
    }
    return c.json(result.voyage);
  });

  // Rejoin by Voyage code in a fresh browser. The code and the token are
  // secrets, so no log line here ever carries either.
  api.post("/rejoin/offers", async (c) => {
    const you = c.get("person");
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const found = typeof body?.code === "string" ? offersFor(db, you.id, body.code) : null;
    if (!found) {
      logEvent(db, { actor: you.id, actorName: you.name, action: "rejoin.refused", detail: { stage: "offers", reason: "unknown voyage", status: 404 } });
      return c.json({ error: "no such Voyage" }, 404);
    }
    return c.json({ offers: found.offers.map(({ deck, playerName }) => ({ deck, playerName })) });
  });

  api.post("/rejoin", async (c) => {
    const you = c.get("person");
    const who = { actor: you.id, actorName: you.name };
    const body = (await c.req.json().catch(() => null)) as { code?: unknown; deck?: unknown } | null;
    if (typeof body?.code !== "string" || typeof body.deck !== "string") {
      logEvent(db, { ...who, action: "rejoin.refused", detail: { reason: "malformed", status: 400 } });
      return c.json({ error: "give a code and a Deck" }, 400);
    }
    const found = offersFor(db, you.id, body.code);
    if (!found) {
      logEvent(db, { ...who, action: "rejoin.refused", detail: { reason: "unknown voyage", status: 404 } });
      return c.json({ error: "no such Voyage" }, 404);
    }
    const offer = found.offers.find((o) => o.deck === body.deck);
    if (!offer || found.seated) {
      const reason = found.seated ? "already seated" : "deck not available";
      logEvent(db, { ...who, voyageId: found.voyage.id, action: "rejoin.refused", detail: { reason, deck: String(body.deck).slice(0, 20), status: 409 } });
      return c.json({ error: "that Deck is not free to take" }, 409);
    }
    attachSession(db, getCookie(c, COOKIE)!, offer.personId);
    logEvent(db, { voyageId: found.voyage.id, actor: offer.personId, actorName: offer.playerName, action: "voyage.rejoined", detail: { deck: offer.deck } });
    publish(found.voyage.id);
    return c.json({ voyage: found.voyage, person: { id: offer.personId, name: offer.playerName } });
  });

  api.post("/voyages/:id/intents", async (c) => {
    const you = c.get("person");
    const voyageId = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    // pose and keypad drafts skip the mutex, the 409 checks, the log and the publish (#57)
    if (isLowTrustKind(raw)) {
      const saved = saveLowTrust(db, voyageId, you.id, raw);
      return saved.ok ? c.json({ ok: true }) : c.json({ error: saved.status === 403 ? "not seated in this Voyage" : "that is not a valid intent" }, saved.status);
    }
    const outcome = await withVoyage(voyageId, () => applyIntent(db, voyageId, you, raw));
    const kind = typeof raw?.kind === "string" ? raw.kind.slice(0, 40) : null;
    if (!outcome.ok) {
      // a refusal for a Voyage the Person isn't seated in stays out of that Voyage's log
      logEvent(db, {
        ...(outcome.reason === "not seated" ? {} : { voyageId }),
        actor: you.id,
        actorName: you.name,
        action: "intent.refused",
        detail: { reason: outcome.reason, status: outcome.status, kind },
      });
      return c.json({ error: outcome.message, offer: outcome.offer }, outcome.status);
    }
    if (outcome.examined) {
      logEvent(db, { voyageId, actor: you.id, actorName: you.name, action: "intent.examine", detail: { thing: outcome.examined } });
    }
    if (outcome.changed) {
      const { result } = outcome;
      if (result) {
        // Strikes and solves belong to the Voyage: logged and announced with no actor (#46).
        if (result.kind === "solved") logEvent(db, { voyageId, action: "puzzle.solved", detail: { slot: result.slot } });
        else if (result.kind === "strike") logEvent(db, { voyageId, action: "strike", detail: { strikes: result.strikes } });
        // a safe step is movement, like pose: it stays out of the log
      } else {
        logEvent(db, { voyageId, actor: you.id, actorName: you.name, action: `intent.${kind}`, detail: { deck: String(raw.deck ?? "") } });
      }
      if (outcome.ended) logEvent(db, { voyageId, actor: you.id, actorName: you.name, action: "voyage.ended", detail: { outcome: "abandoned" } });
      if (outcome.started && kind === "cast-off") logEvent(db, { voyageId, action: "voyage.cast-off" });
      publish(
        voyageId,
        result?.kind === "solved"
          ? { event: "bell", data: { slot: result.slot } }
          : result?.kind === "strike"
            ? { event: "strike", data: { strikes: result.strikes } }
            : undefined,
      );
    }
    return c.json({ ok: true });
  });

  // The debrief: both Decks and the timeline, for the Voyage's two Players only,
  // and only once it is over. 403 for a stranger (and for an unknown id), then 409 while live.
  api.get("/voyages/:id/debrief", (c) => {
    const you = c.get("person");
    const voyage = voyageById(db, c.req.param("id"));
    if (!voyage || !seatedPlayers(db, voyage.id).some((p) => p.id === you.id)) {
      logEvent(db, { actor: you.id, actorName: you.name, action: "debrief.refused", detail: { reason: "not seated", status: 403 } });
      return c.json({ error: "not seated in this Voyage" }, 403);
    }
    settleClock(db, voyage.id, Date.now());
    const debrief = debriefOf(db, voyage.id);
    if (!debrief) {
      logEvent(db, { voyageId: voyage.id, actor: you.id, actorName: you.name, action: "debrief.refused", detail: { reason: "voyage live", status: 409 } });
      return c.json({ error: "the debrief opens once the Voyage is over" }, 409);
    }
    return c.json(debrief);
  });

  // "Post our Score": each Player agrees or withdraws; the entry is posted only
  // when both have agreed. The request carries no Score, only the consent.
  api.post("/voyages/:id/post-score", async (c) => {
    const you = c.get("person");
    const voyage = voyageById(db, c.req.param("id"));
    if (!voyage || !seatedPlayers(db, voyage.id).some((p) => p.id === you.id)) {
      logEvent(db, { actor: you.id, actorName: you.name, action: "post-score.refused", detail: { reason: "not seated", status: 403 } });
      return c.json({ error: "not seated in this Voyage" }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as { consent?: unknown } | null;
    if (typeof body?.consent !== "boolean") return c.json({ error: "say whether you consent" }, 400);
    const result = await withVoyage(voyage.id, async () => {
      settleClock(db, voyage.id, Date.now());
      return setConsent(db, voyage.id, you.id, body.consent as boolean);
    });
    if (result !== "ok") {
      logEvent(db, { voyageId: voyage.id, actor: you.id, actorName: you.name, action: "post-score.refused", detail: { reason: result, status: 409 } });
      return c.json({ error: result === "posted" ? "the Score is already posted" : "only a launched Voyage has a Score to post" }, 409);
    }
    logEvent(db, { voyageId: voyage.id, actor: you.id, actorName: you.name, action: body.consent ? "post-score.consented" : "post-score.withdrawn" });
    publish(voyage.id);
    publishLeaderboard();
    return c.json({ ok: true });
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
      const disconnected = markConnected(voyage.id, you.id);
      const send = async (notice?: Notice): Promise<void> => {
        await stream.writeSSE({ event: "snapshot", data: JSON.stringify(snapshotFor(db, voyage, you)) });
        // a notice carries no Clue, no answer and no Player, so both Decks get the same one
        if (notice) await stream.writeSSE({ event: notice.event, data: JSON.stringify(notice.data) });
      };
      await send(); // the first event on every connection is the full state
      const unsubscribe = subscribe(voyage.id, (notice) => void send(notice));
      const beat = setInterval(() => void stream.write(": heartbeat\n\n"), HEARTBEAT_MS);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(beat);
      unsubscribe();
      disconnected();
      logEvent(db, { ...who, action: "stream.closed" });
    });
  });

  return api;
}
