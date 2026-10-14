import { settingsFromClue } from "./finale.ts";
import { codeFromClue } from "./mural.ts";
import { parsePlan, routes } from "./rotten-floor.ts";
import { intent, post, snapshot, underway } from "./voyage.ts";

type Underway = Awaited<ReturnType<typeof underway>>;

/**
 * Plays a fresh Voyage through to the finale hold, using only what each
 * Player can read. The Lifeboat launches when the hold completes, which a
 * server (re)started ten seconds later notices.
 */
export async function playToFinaleHold(base: string): Promise<Underway> {
  const v = await underway(base);
  const { voyage, host, partner } = v;
  const openerClue = (await snapshot(base, voyage.id, host.cookie)).draw!.puzzles[0].clue!;
  await intent(base, voyage.id, partner, { kind: "submit", deck: "Lower Deck", slot: "opener", answer: codeFromClue(openerClue) });
  const planClue = (await snapshot(base, voyage.id, partner.cookie)).draw!.puzzles[1].clue!;
  for (const dir of routes(parsePlan(planClue))[0]) {
    await intent(base, voyage.id, host, { kind: "walk-step", deck: "Upper Deck", slot: "middle", dir });
  }
  const finale = (await snapshot(base, voyage.id, host.cookie)).draw!.puzzles[2];
  const target = settingsFromClue(finale.clue!);
  const valves = (await snapshot(base, voyage.id, partner.cookie)).draw!.puzzles[2].instrument!.valves!;
  const trims = finale.instrument!.trims!;
  const dial = (who: typeof host, kind: string, deck: string, index: number, by: number) =>
    post(base, `/api/voyages/${voyage.id}/intents`, who.cookie, { seq: 0, kind, deck, index, by });
  for (let i = 0; i < valves.length; i++) {
    for (let n = valves[i]; n !== target.valves[i]; n += Math.sign(target.valves[i] - n)) await dial(partner, "turn-valve", "Lower Deck", i, Math.sign(target.valves[i] - n));
    for (let n = trims[i]; n !== target.trims[i]; n += Math.sign(target.trims[i] - n)) await dial(host, "turn-trim", "Upper Deck", i, Math.sign(target.trims[i] - n));
  }
  return v;
}
