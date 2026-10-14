# Coding standards

Read at review. Each rule names the decision that owns it; where a rule and
its source disagree, the source wins. Mechanical rules are enforced by
checks and listed last, so review spends its attention on the judgement calls.

## Judgement calls

- **Clue text lives with its Puzzle's logic.** A Clue renderer reads the same
  checker data the server checks against, in the same Puzzle version module.
  Hand-written Clue copy that can drift from the answer is a violation
  ([#13](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/13) claim 2).
- **A stored Draw is a contract.** Any change to the shape or meaning of a
  stored Puzzle's data is a new version (`"id@v"`), with the old version left
  loadable ([ADR 0001](docs/adr/0001-versioned-puzzle-draw-data.md)).
- **The server decides.** Clients send intents; the server checks them in the
  refusal order 401 → 403 (not seated) → 403 (not your Deck) → 409 → 400, then
  the 429 throttle, and logs each refusal with its reason. A client never
  computes a Score, a Strike or a solve
  ([#11](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/11)).
- **Payloads carry one Deck.** Anything sent to a Player (POST response, SSE
  event, error body) holds only their own Deck and never an answer
  ([ADR 0007](docs/adr/0007-one-package-answers-stay-under-server.md)).
- **Logs are safe to show.** A token, password or Voyage code never reaches the
  events table or stdout. Pose and keypad drafts stay out of the log entirely
  ([#11](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/11),
  [#31](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/31)).
- **Room data declares no cue.** Nothing marks a usable thing as usable, and
  every usable thing does something when used within reach
  ([#33](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/33)).
- **Glossary vocabulary in code.** Names, test titles and copy use the
  `GLOSSARY.md` term, not a word from its _Avoid_ list (Voyage, not attempt;
  Deck, not Room).

## Enforced by checks

- `client/` imports only `shared/`; `shared/` imports neither; answers and
  checkers stay under `server/`: `spec/boundaries.unit.test.ts`.
- Erasable TypeScript only, and `.ts` extensions on relative imports:
  `tsconfig.json` (`erasableSyntaxOnly`, `allowImportingTsExtensions`).
