// Wire types for the lobby (ADR 0007: shared holds types only).
import type { PublicDraw, Slot } from "./draw.ts";
import type { DeckName, Pose } from "./intents.ts";

export interface PersonView {
  id: string;
  name: string;
  /** True once the Person has an Account; absent for a Guest. */
  account?: true;
}

export interface VoyageView {
  id: string;
  ship: string;
  /** Path on this origin that opens the lobby directly. */
  link: string;
  code: string;
}

export interface DeckCard {
  deck: DeckName;
  /** Who holds this Deck, or null while it is empty. */
  player: PersonView | null;
  /** Whether the holder has a stream open right now. */
  connected: boolean;
  /** Whether the holder has pressed "Cast off". */
  castOff: boolean;
}

export interface LobbySnapshot {
  voyage: VoyageView;
  you: PersonView;
  players: PersonView[];
  decks: DeckCard[];
  /** The Deck you hold, or null before you choose one. */
  yourDeck: DeckName | null;
  /** The Voyage sequence number to send with your next intent. */
  seq: number;
  /** True once both Players have pressed "Cast off". */
  started: boolean;
  /** Your Deck's view of the Draw, or null until the Voyage has started. */
  draw: PublicDraw | null;
  /** True once either Player has ended the Voyage. */
  ended: boolean;
  /** Where you last stood, or null. Yours alone: the partner's snapshot never carries it (#57). */
  pose: Pose | null;
  /** Your half-typed keypad codes by slot. Yours alone (#57). */
  drafts: Partial<Record<Slot, string>>;
}

/** One row of the profile screen's lists. */
export interface VoyageListing extends VoyageView {
  /** Null while unfinished. */
  outcome: "abandoned" | null;
}

export interface ProfileVoyages {
  unfinished: VoyageListing[];
  finished: VoyageListing[];
}

/** A Deck a fresh browser may take over: its Player isn't connected. */
export interface RejoinOffer {
  deck: DeckName;
  playerName: string;
}
