import { z } from "zod";
import { SLOTS } from "./draw.ts";

// Every intent is a typed POST to /api/voyages/:id/intents (ADR 0004). `seq`
// is the Voyage sequence number the Player's screen last saw; the server
// refuses an intent whose seq has moved on (409), so a lost race never
// applies on top of a state the Player didn't see.
export const DECKS = ["Upper Deck", "Lower Deck"] as const;
export type DeckName = (typeof DECKS)[number];

export const WALK_DIRS = ["north", "south", "east", "west"] as const;
export type WalkDir = (typeof WALK_DIRS)[number];

const seq = z.number().int().nonnegative();

export const intentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choose-deck"), seq, deck: z.enum(DECKS) }),
  z.strictObject({ kind: z.literal("cast-off"), seq }),
  // An answer for one Puzzle's lock. The server checks it; the client never decides a solve.
  z.strictObject({ kind: z.literal("submit"), seq, deck: z.enum(DECKS), slot: z.enum(SLOTS), answer: z.string().regex(/^\d{4}$/) }),
  // The finale's live dials (#48). Each Deck turns only its own. They carry an
  // optional seq the server ignores, so turns from both Decks inside the same
  // second are all applied in server order rather than refused as a lost race.
  z.strictObject({ kind: z.literal("turn-valve"), seq: seq.optional(), deck: z.enum(DECKS), index: z.number().int().min(0).max(9), by: z.union([z.literal(1), z.literal(-1)]) }),
  z.strictObject({ kind: z.literal("turn-trim"), seq: seq.optional(), deck: z.enum(DECKS), index: z.number().int().min(0).max(9), by: z.union([z.literal(1), z.literal(-1)]) }),
  // An explicit "lock in" on the instrument: off target it is a Strike.
  z.strictObject({ kind: z.literal("lock-in"), seq, deck: z.enum(DECKS) }),
  // One step of the Walker (blind navigator Puzzles). The server decides what the step does.
  z.strictObject({ kind: z.literal("walk-step"), seq, deck: z.enum(DECKS), slot: z.enum(SLOTS), dir: z.enum(WALK_DIRS) }),
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
