import type { LobbySnapshot } from "../../shared/lobby.ts";
import { settingsFromClue } from "./finale.ts";
import { codeFromClue } from "./mural.ts";
import { parsePlan, routes } from "./rotten-floor.ts";
import { openSse } from "./sse.ts";
import { intent, post, snapshot, underway } from "./voyage.ts";

type Who = Parameters<typeof intent>[2];
export type FinaleKind = "valves-gauges" | "helm-telegraph";

/**
 * A Voyage on `base` with the opener and the middle solved from the Clues alone, so the finale is live.
 * The Draw picks a finale at random (#64), so `kind` names the one the spec needs: a Voyage that drew the
 * other is dropped and another is begun, until the wanted one comes up. Omit it to take whichever came.
 */
export async function atFinale(base: string, kind?: FinaleKind) {
  for (;;) {
    const l = await underway(base);
    // both Players stay connected the way open browsers do: a slow setup must not outlast the 8 s grace and freeze the Voyage (#56)
    const streams = [await openSse(new URL(`/api/voyages/${l.voyage.id}/events`, base), l.host.cookie), await openSse(new URL(`/api/voyages/${l.voyage.id}/events`, base), l.partner.cookie)];
    const snap = (who: Who): Promise<LobbySnapshot> => snapshot(base, l.voyage.id, who.cookie);
    const opener = (await snap(l.host)).draw!.puzzles[0];
    await intent(base, l.voyage.id, l.partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: codeFromClue(opener.clue!) });
    const plan = parsePlan((await snap(l.partner)).draw!.puzzles[1].clue!);
    for (const dir of routes(plan)[0]) {
      await intent(base, l.voyage.id, l.host, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir });
    }
    const drew: FinaleKind = /telegraph/i.test((await snap(l.host)).draw!.puzzles[2].clue ?? "") ? "helm-telegraph" : "valves-gauges";
    if (kind && drew !== kind) {
      for (const { stream } of streams) stream.close();
      continue;
    }
    return { ...l, streams };
  }
}

/** Turns the dials from the Decks' own views and the Clue text until the instrument is in band. */
export async function steerIntoBand(base: string, l: Awaited<ReturnType<typeof atFinale>>): Promise<void> {
  const finale = async (who: Who) => (await snapshot(base, l.voyage.id, who.cookie)).draw!.puzzles[2];
  const target = settingsFromClue((await finale(l.host)).clue!);
  const valves = (await finale(l.partner)).instrument!.valves!;
  const trims = (await finale(l.host)).instrument!.trims!;
  const turn = (who: Who, kind: string, deck: string, index: number, by: number) =>
    post(base, `/api/voyages/${l.voyage.id}/intents`, who.cookie, { seq: 0, kind, deck, index, by });
  for (let i = 0; i < valves.length; i++) {
    for (let n = valves[i]; n !== target.valves[i]; n += Math.sign(target.valves[i] - n)) {
      await turn(l.partner, "turn-valve", "Lower Deck", i, target.valves[i] > n ? 1 : -1);
    }
    for (let n = trims[i]; n !== target.trims[i]; n += Math.sign(target.trims[i] - n)) {
      await turn(l.host, "turn-trim", "Upper Deck", i, target.trims[i] > n ? 1 : -1);
    }
  }
}
