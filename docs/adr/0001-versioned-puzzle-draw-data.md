# Stored Draws are versioned per Puzzle, and old versions stay playable

An unfinished Voyage has to resume after a redeploy, because the marker comes back the next day and CI deploys every push to `main`. Storing the full Draw, rather than a seed, already stops a changed generator from rebuilding a different Puzzle. A Puzzle's checker or renderer can still change the shape of the data it reads, though. So each Puzzle's stored data shape is a contract: changing the shape means a new Puzzle version, and the old version stays readable and playable until no unfinished Voyage uses it. A `spec/` check loads a stored Draw fixture from the previous version and plays it through to solved.

## Considered Options

- **Seed only, regenerate on load:** rejected. A redeploy that touches a generator silently gives a resumed Voyage different answers and Clues.
- **Store the full Draw, but let in-progress Voyages break on deploy:** rejected. This fails the brief's "still there when they come back" in exactly the case the marker tests.
- **Migrate stored Draws forward on deploy:** rejected for now. Rewriting answers and Clue data under a Team mid-attempt risks changing what one Player has already described to the other.

## Consequences

Every Puzzle carries a version, and the server keeps the checker and renderer for any version an unfinished Voyage still references. Nothing expires automatically, so retiring an old version only happens once no unfinished Voyage is on it.
