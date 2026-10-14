import { z } from "zod";

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
]);

export type Intent = z.infer<typeof intentSchema>;
