import type { LobbySnapshot } from "../../shared/lobby.ts";
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
