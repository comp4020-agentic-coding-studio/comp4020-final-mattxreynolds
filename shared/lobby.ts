// Wire types for the lobby (ADR 0007: shared holds types only).
import type { DeckName } from "./intents.ts";

export interface PersonView {
  id: string;
  name: string;
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
}

/** A Deck a fresh browser may take over: its Player isn't connected. */
export interface RejoinOffer {
  deck: DeckName;
  playerName: string;
}
