# TODO

## CURRENT
- Second production cycle (docs/SYSTEMS.md, ADR 005). Done and committed:
  ship simulation, five acts (new CASCADE act), davits finale, modes,
  practice, crew unlocks, same-ship replay, debrief (in-game + /log/CODE/),
  cinematic bookends, event sequence + restart recovery, chaos spec.
- In progress: new rooms. Aux Machinery Room (Engineer) and Comms Room
  (Bridge), by two room workstreams; then integration of the browser specs.

## NEXT
- Human playtest with two people: difficulty, banner wording, audio levels,
  pulse beep, 10–15 min length (balance figures are estimates; see
  docs/GAME_DESIGN.md).
- Build and run the Docker image. Docker isn't available in the dev WSL env;
  the prod-only runtime was simulated without Docker and worked.
- Optional perf: bake a fixed light set in the Engine Room (9 lights).

## BLOCKED (needs the student)
- Choose the submission repo/remote; update PROCESS.md commit-link prefix.
- Fly deploy: `flyctl deploy --remote-only --ha=false -a <repo-name>` (token
  in mise.local.toml). Not run: needs explicit go-ahead.
- README "What good means": the student's own argument and sources ([STUDENT REVIEW]).
- reflections/crit-10.md: the student's own words.

## COMPLETED
- Starter template imported unchanged; docs, ADRs, CLAUDE.md.
- Vertical slice → full game: lobby, prologue, power, flood, radio, escape,
  survived/lost, Ship's Log, sail again.
- Engine Room + Bridge 3D, audio, phase guide banner, endings.
- Reliability suite: persistence across SIGTERM/SIGKILL restarts, secrecy,
  authority/races, presence/pause, replay, pages, slow/offline links.
- Polish pass: latched toggles, sail-again double-connect, cross-room audio.
- Blind-play audit: all four puzzles were solvable without talking; fixed
  and locked in with unit tests. Danger rebalanced.
- Marker simulation from /readme/ with two profiles + mid-voyage server restart.
