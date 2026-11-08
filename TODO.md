# TODO

## CURRENT
- Sprint 3 (branch production/cinematic-polish-qa, docs/sprint3/SPRINT.md,
  issue register docs/sprint3/ISSUES.md): cinematic overhaul (shot-list
  director, lofted ship, collision, lifeboat launch), four-room visual audit,
  QA fix loop, Bridge sea-through-floor fix. Now: cinematic round 2, final
  check, PR.

## NEXT
- Balance decisions from sprint 3 QA (ISSUES.md COOP-1/2/3/7): Escape
  solvable blind by a reactive Engineer; Act IV reachable with an idle
  Engineer; NIGHTMARE survivable by a scripted crew; same-ship reruns count
  toward unlocks. All need human playtests before a rule change.
- Human playtests of the five-act voyage: is Act IV readable, is the
  difficulty curve (escape after a few attempts) right, are the cinematics
  the right length. All balance figures are from scripted crews.
- Flood is still solvable alone at a cost (PUZZLES.md "Honest limit").
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
- Dev mode (docs/DEV_MODE.md): one browser holds both seats, F2 switches,
  skip/danger/sink panel; off in production, spec/dev-mode.test.ts.
- Second cycle: ship simulation (grid/water/hull), five acts with CASCADE,
  Aux Machinery + Comms rooms, seeded Act IV, cross-act consequences (wear,
  seams, lost compartments, answered calls), davits finale, debrief
  (in-game + /log/CODE/), modes + unlocks per crew, practice, same-ship
  replay, cinematics, event seq + restart recovery, chaos spec.
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
