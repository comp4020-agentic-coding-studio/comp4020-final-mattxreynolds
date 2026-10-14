import type { LobbySnapshot } from "../../shared/lobby.ts";
import { codeFromClue } from "./mural.ts";
import { openSse, parseFrame } from "./sse.ts";

export interface Sailor {
  cookie: string;
  id: string;
  name: string;
}

export interface Started {
  id: string;
  ship: string;
  link: string;
  code: string;
}

export async function guest(base: string): Promise<Sailor> {
  const res = await fetch(new URL("/api/guest", base), { method: "POST" });
  const person = (await res.json()) as { id: string; name: string };
  return { cookie: res.headers.getSetCookie()[0].split(";")[0], ...person };
}

export const post = (base: string, path: string, cookie: string | null, body?: unknown): Promise<Response> =>
  fetch(new URL(path, base), {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

/** A host and a partner, both seated in one fresh Voyage. */
export async function lobby(base: string): Promise<{ voyage: Started; host: Sailor; partner: Sailor }> {
  const host = await guest(base);
  const voyage = (await (await post(base, "/api/voyages", host.cookie, {})).json()) as Started;
  const partner = await guest(base);
  await post(base, "/api/join", partner.cookie, { code: voyage.code });
  return { voyage, host, partner };
}

/** A lobby whose Players hold a Deck each (host Upper, partner Lower) and have both cast off. */
export async function underway(base: string): ReturnType<typeof lobby> {
  const l = await lobby(base);
  await intent(base, l.voyage.id, l.host, { kind: "choose-deck", deck: "Upper Deck" });
  await intent(base, l.voyage.id, l.partner, { kind: "choose-deck", deck: "Lower Deck" });
  await intent(base, l.voyage.id, l.host, { kind: "cast-off" });
  await intent(base, l.voyage.id, l.partner, { kind: "cast-off" });
  return l;
}

/** The Voyage's current state, as one fresh stream's first frame. */
export async function snapshot(base: string, voyageId: string, cookie: string): Promise<LobbySnapshot> {
  const { stream } = await openSse(new URL(`/api/voyages/${voyageId}/events`, base), cookie);
  const snap = parseFrame(await stream.next()).data as LobbySnapshot;
  stream.close();
  return snap;
}

/** Posts an intent with the Voyage's current seq, unless the body names one. */
export async function intent(
  base: string,
  voyageId: string,
  who: Sailor,
  body: Record<string, unknown>,
): Promise<Response> {
  const seq = "seq" in body ? body.seq : (await snapshot(base, voyageId, who.cookie)).seq;
  return post(base, `/api/voyages/${voyageId}/intents`, who.cookie, { ...body, seq });
}

export type OpenerKind = "mural" | "levers";

/** Which opener a Clue text belongs to. */
export const openerOf = (clue: string): OpenerKind => (/Wire \d: lever/.test(clue) ? "levers" : "mural");

/**
 * An underway Voyage whose opener is the given Puzzle (the Draw picks one of
 * two at random, so this casts off fresh Voyages until it gets that one).
 */
export async function underwayWith(base: string, kind: OpenerKind): ReturnType<typeof lobby> {
  for (let tries = 0; tries < 40; tries++) {
    const l = await underway(base);
    const clue = (await snapshot(base, l.voyage.id, l.host.cookie)).draw!.puzzles[0].clue!;
    if (openerOf(clue) === kind) return l;
  }
  throw new Error(`no ${kind} opener drawn in 40 Voyages`);
}

export type MiddleKind = "rotten-floor" | "bilge-plates";

/** Which middle a Clue text belongs to (#63). */
export const middleOf = (clue: string): MiddleKind => (/bilge survey/i.test(clue) ? "bilge-plates" : "rotten-floor");

/**
 * An underway Voyage with the opener solved through the API (from its Clue, whichever opener the Draw picked)
 * so the middle is live, and the middle is the given Puzzle. A middle's Clue shows only once it is live and the
 * Draw picks it at random, so this casts off fresh Voyages until it gets that one.
 */
export async function underwayAtMiddle(base: string, kind: MiddleKind): ReturnType<typeof lobby> {
  for (let tries = 0; tries < 60; tries++) {
    const l = await underway(base);
    const opener = (await snapshot(base, l.voyage.id, l.host.cookie)).draw!.puzzles[0].clue!;
    await intent(base, l.voyage.id, l.partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: codeFromClue(opener) });
    const middle = (await snapshot(base, l.voyage.id, l.partner.cookie)).draw!.puzzles[1].clue!;
    if (middleOf(middle) === kind) return l;
  }
  throw new Error(`no ${kind} middle drawn in 60 Voyages`);
}
