// What a Player who can only read the mural would key in: the plaque's rule
// applied to the Clue text alone, never to stored data.
export function codeFromClue(text: string): string {
  const digits = [...text.matchAll(/Panel \d: (\d) [a-z]+/g)].map((m) => m[1]);
  return (/from the right/.test(text) ? digits.reverse() : digits).join("");
}
