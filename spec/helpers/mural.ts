// What a Player who can only read the opener's Clue would key in: the rule on
// the card applied to the Clue text alone, never to stored data. Handles both
// openers: the mural (four counts) and the wiring card (five lever numbers).
export function codeFromClue(text: string): string {
  const levers = [...text.matchAll(/Wire \d: lever (\d)/g)].map((m) => m[1]);
  if (levers.length > 0) return (/from the bottom/.test(text) ? levers.reverse() : levers).join("");
  const digits = [...text.matchAll(/Panel \d: (\d) [a-z]+/g)].map((m) => m[1]);
  return (/from the right/.test(text) ? digits.reverse() : digits).join("");
}
