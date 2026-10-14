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
  /** Time left on the Clock as of this snapshot, the same on both Decks; null before cast off. */
  clock: { secondsLeft: number } | null;
  /** True once the Voyage is over: ended by a Player, launched or sunk. */
  ended: boolean;
  /** The end card's numbers once the Voyage is over; null while it is live. Both Decks get the same. */
  end: EndCard | null;
  /** Where you last stood, or null. Yours alone: the partner's snapshot never carries it (#57). */
  pose: Pose | null;
  /** Your half-typed keypad codes by slot. Yours alone (#57). */
  drafts: Partial<Record<Slot, string>>;
}

/** One row of the profile screen's lists. */
export interface VoyageListing extends VoyageView {
  /** Null while unfinished. */
  outcome: "abandoned" | "launched" | "sank" | null;
}

export interface ProfileVoyages {
  unfinished: VoyageListing[];
  finished: VoyageListing[];
}

/** The end card both Decks show once the Voyage is over (#60). The Score is set only for a launch. */
export interface EndCard {
  outcome: "abandoned" | "launched" | "sank";
  /** Clock time left at launch, in ms; null unless launched. */
  scoreMs: number | null;
  strikes: number;
  solved: number;
  /** How many Puzzles the Draw held. */
  total: number;
}

export interface DebriefPuzzle {
  slot: Slot;
  /** "clue" if this Deck held the Clue, "lock" if it took the answer. */
  role: "clue" | "lock";
  solved: boolean;
  /** The Clue text, only on the Deck that held it; never an answer. */
  clue: string | null;
}

export interface DebriefDeck {
  deck: DeckName;
  room: string;
  player: { name: string } | null;
  puzzles: DebriefPuzzle[];
}

export interface DebriefEntry {
  at: number;
  /** Player name of whoever did it; null for things that belong to the Voyage (a Strike, a solve). */
  actor: string | null;
  text: string;
}

/** Both Decks side by side, for the two Players only and only once the Voyage is over (#60). */
export interface Debrief {
  ship: string;
  end: EndCard;
  decks: DebriefDeck[];
  timeline: DebriefEntry[];
}

/** "<from> started a new Voyage with you": on the partner's profile after "Sail again" (#61). */
export interface Banner {
  /** Player name of whoever opened the new lobby. */
  from: string;
  voyage: VoyageView;
}

/** A Deck a fresh browser may take over: its Player isn't connected. */
export interface RejoinOffer {
  deck: DeckName;
  playerName: string;
}
