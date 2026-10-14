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
  // Using a thing in the scene (#52): never a Strike, never a state change, so seq is optional.
  z.strictObject({ kind: z.literal("examine"), seq: seq.optional(), thing: z.string().min(1).max(60) }),
  // Ending needs no seq: either Player may stop at any state, from the profile
  // too, where no snapshot has been seen.
  z.strictObject({ kind: z.literal("end-voyage"), seq: seq.optional() }),
]);

export type Intent = z.infer<typeof intentSchema>;

// The two low-trust kinds (#57): stored as overwritten rows, never logged, and
// exempt from the 409 checks, so `seq` is accepted but never compared. They
// are parsed apart from intentSchema so no handler for a real intent sees them.
const num = z.number().finite();
export const poseSchema = z.strictObject({
  kind: z.literal("pose"),
  seq: seq.optional(),
  x: num,
  y: num,
  z: num,
  yaw: num,
  pitch: num,
});
export const keypadDraftSchema = z.strictObject({
  kind: z.literal("keypad-draft"),
  seq: seq.optional(),
  slot: z.enum(SLOTS),
  text: z.string().regex(/^\d{0,4}$/),
});
export const lowTrustSchema = z.discriminatedUnion("kind", [poseSchema, keypadDraftSchema]);
export type Pose = Omit<z.infer<typeof poseSchema>, "kind" | "seq">;
