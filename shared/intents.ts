import { z } from "zod";
import { SLOTS } from "./draw.ts";

// Every intent is a typed POST to /api/voyages/:id/intents (ADR 0004). `seq`
// is the Voyage sequence number the Player's screen last saw; the server
// refuses an intent whose seq has moved on (409), so a lost race never
// applies on top of a state the Player didn't see.
export const DECKS = ["Upper Deck", "Lower Deck"] as const;
export type DeckName = (typeof DECKS)[number];

const seq = z.number().int().nonnegative();

export const intentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choose-deck"), seq, deck: z.enum(DECKS) }),
  z.strictObject({ kind: z.literal("cast-off"), seq }),
  // An answer for one Puzzle's lock. The server checks it; the client never decides a solve.
  z.strictObject({ kind: z.literal("submit"), seq, deck: z.enum(DECKS), slot: z.enum(SLOTS), answer: z.string().regex(/^\d{4}$/) }),
  // Ending needs no seq: either Player may stop at any state, from the profile
  // too, where no snapshot has been seen.
  z.strictObject({ kind: z.literal("end-voyage"), seq: seq.optional() }),
]);

export type Intent = z.infer<typeof intentSchema>;
