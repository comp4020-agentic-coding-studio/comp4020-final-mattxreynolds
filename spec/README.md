# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## What the game's checks protect

The checks under `spec/` hold the game's promises, not only its pages. In the
order a Player would feel them:

- **Each Deck sees only its own half** (ADR 0007). `every-puzzle.test.ts`
  plays a Voyage to every Puzzle in the registry and reads every payload and
  SSE frame both Decks receive: none holds the other Deck's Clue lines, a stored
  field or an answer, and a Person who is not seated gets a 403 and nothing
  else. A Puzzle added to the registry is covered with no edit to the spec.
- **The server decides, and a refusal is never a Strike** (#11). The same spec
  sends each Puzzle the wrong Deck's answer, a stale `seq`, a dead station, a
  typed answer to a worked station and a repeat of a solved one: every one is a
  409, and both Decks then show the same `seq`, Strikes and Puzzle statuses.
- **The Clock is fair at the edge** (#23). `clock.test.ts` and
  `launch-timing.test.ts` freeze time: a launch whose hold ends one second
  before zero wins with that second as its Score, one second after is a sunk
  ship and later input is a 409. Both Decks' dial turns in the same second are
  all applied (`valves-gauges.test.ts`, `helm-telegraph.test.ts`).
- **Every control is a 44 px target on a phone at 390x844** (#18).
  `controls-44px.unit.test.ts` sweeps every pressed thing in both Rooms from the
  furthest spot within reach; the scene specs repeat it in a real browser.
- **Logs and names are safe to show** (#11, #10). Pose and keypad drafts, tokens
  and Voyage codes never reach the events table or stdout. Names are stored as
  typed once cleaned, and `player-name.unit.test.ts` checks that nothing in
  `client/` draws raw HTML, so escaping stays Svelte's job.

Browser specs get 60 s each (`vitest.config.ts`): they cast off a Voyage through
two pages. A spec that starts its own server (`helpers/second-server.ts`) has it
torn down with the worker, even when the spec times out, so none outlives its run.
