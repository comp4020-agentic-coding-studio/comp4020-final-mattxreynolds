// Wire types for the lobby (ADR 0007: shared holds types only).
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

export interface LobbySnapshot {
  voyage: VoyageView;
  you: PersonView;
  players: PersonView[];
  decks: { deck: "Upper Deck" | "Lower Deck"; player: string | null }[];
}
