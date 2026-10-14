// Player names are shown to the partner and on the Leaderboard, so the server
// cleans every one before storing it (#10): control and zero-width characters
// stripped, trimmed, capped, checked against a blocklist. The name is stored as typed once cleaned, never
// HTML-escaped: escaping is the job of whatever draws it, and Svelte escapes
// every text interpolation, so an ampersand shows as an ampersand in the edit
// box and a tag shows as text. Nothing in client/ may use {@html} (a spec checks).
export const PLAYER_NAME_MAX = 20;

// Cc controls, Cf format characters (zero-width, bidi marks, BOM), line/paragraph separators
const INVISIBLE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

const BLOCKLIST = new Set([
  "fuck", "fucker", "fucking", "shit", "bitch", "cunt", "dick", "cock", "pussy", "slut", "whore",
  "bastard", "asshole", "arse", "wank", "wanker", "twat", "nigger", "nigga", "faggot", "retard", "rape", "nazi",
]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

// Whole words only, so "Scunthorpe" passes; leetspeak and spacing tricks don't.
function blocked(name: string): boolean {
  const plain = [...name.toLowerCase()].map((ch) => LEET[ch] ?? ch).join("");
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BLOCKLIST.has(w)) || BLOCKLIST.has(words.join(""));
}

export type NameResult = { ok: true; name: string } | { ok: false; reason: "not a string" | "empty" | "blocked" };

export function sanitisePlayerName(input: unknown): NameResult {
  if (typeof input !== "string") return { ok: false, reason: "not a string" };
  const name = [...input.replace(INVISIBLE, "").trim()].slice(0, PLAYER_NAME_MAX).join("").trim();
  if (!name) return { ok: false, reason: "empty" };
  if (blocked(name)) return { ok: false, reason: "blocked" };
  return { ok: true, name };
}
