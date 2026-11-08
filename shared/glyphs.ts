// Glyphs are drawn shapes with no printed name in the game. The names here are
// for code, the voyage log and accessibility labels only.

export const GLYPHS = ["anchor", "gear", "bolt", "wave", "star", "crescent", "trident", "bell"] as const;
export type Glyph = (typeof GLYPHS)[number];

export const COMPARTMENTS = ["FORE", "CARGO", "ENGINE"] as const;
export type Compartment = (typeof COMPARTMENTS)[number];
export const COMPARTMENT_LABEL: Record<Compartment, string> = {
  FORE: "FORE HOLD",
  CARGO: "CARGO",
  ENGINE: "ENGINE BAY",
};

export const SYSTEMS = ["PUMPS", "RADIO", "HELM"] as const;
export type ShipSystem = (typeof SYSTEMS)[number];

/** 8 compass points, index 0 = N, clockwise. */
export const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Bearing = (typeof BEARINGS)[number];

/** A pulse pattern: true = long, false = short. */
export type Pulse = boolean[];
export const pulseText = (p: Pulse): string => p.map((l) => (l ? "▬" : "•")).join(" ");
