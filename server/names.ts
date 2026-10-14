import { randomInt } from "node:crypto";

const COLOURS = ["Amber", "Brass", "Coral", "Slate", "Indigo", "Russet", "Saffron", "Teal", "Umber", "Verdigris"];
const BIRDS = ["Heron", "Petrel", "Gannet", "Tern", "Cormorant", "Albatross", "Plover", "Curlew", "Skua", "Shearwater"];
const SHIPS = ["Marguerite", "Halcyon", "Northern Wren", "Calliope", "Tamsin Rose", "Bellwether", "Orpheus", "Lorelei", "Saltmarsh", "Cormorant Queen"];
const CODE_WORDS = ["KESTREL", "OSPREY", "FULMAR", "MERLIN", "LINNET", "BITTERN", "GODWIT", "SANDERLING", "TURNSTONE", "WIGEON"];

const pick = (list: string[]): string => list[randomInt(list.length)];

export const guestName = (): string => `${pick(COLOURS)} ${pick(BIRDS)}`;
export const shipName = (): string => pick(SHIPS);
// e.g. SS-KESTREL-4821
export const voyageCode = (): string => `SS-${pick(CODE_WORDS)}-${String(randomInt(10000)).padStart(4, "0")}`;
