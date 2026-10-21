# ADR 005 — One five-act voyage over a continuous ship simulation

## Context
The first production cycle shipped four sequential puzzles over a single
"danger" number. Each puzzle's state froze when it was solved, so earlier
decisions didn't matter later and the ship was a backdrop. The second cycle
asked for a systemic simulation, five escalating acts, unlockable rooms,
cross-phase consequences, a stronger finale, modes and practice, while
keeping every invariant in CLAUDE.md.

## Options
1. Rewrite as a general-purpose simulation (entity/component systems,
   arbitrary room graphs) and re-express the puzzles inside it.
2. Keep the phase state machine and puzzles, and add a small set of
   continuous systems (grid, water, hull) that run underneath them from
   Act II to the end, plus one new phase (CASCADE) that combines them.
3. Keep phases independent and add more phases.

## Decision
Option 2. `Phase` keeps its guarded `advance()`. Acts are a projection of
phases (`ACT_OF`). `server/game/ship.ts` holds the continuous systems as
pure functions of `(voyage, now, dt)`. The existing puzzle intents remain
idempotent set-operations; Act II's valve and pump intents become legal
until the voyage ends. Consequences are carried as explicit state
(`powerTrips`, `seams`, `lost`, `callsAnswered`), so each one is visible in
a view and explained in the debrief. None is a hidden trap. Practice starts
from a scenario built from the voyage's own seed (`scenario.ts`), not from a
saved snapshot. Modes are multipliers over the same systems (`MODE_RULES`),
so no mode has rules of its own.

Rooms beyond the first two are unlocked by phase (`ROOM_UNLOCK`). Each new
room belongs to one role, so the secrecy boundary is unchanged:
`views.ts` projects grid output and heat to the Engineer only, and circuit
draw, breaches and caller bearings to the Bridge only.

## Consequences
- The old saves upgrade in place (`upgradeVoyage`), and old seeds keep their
  Act I–III puzzles (Act IV is drawn from a separate RNG stream).
- `state_json` grows (event log ≤ 400 entries, ≤ 480 samples), still well
  under 100 KB.
- Blind-play analysis must now cover strategies that react to live gauges,
  not just fixed sweeps. One such strategy found that Flood was beatable
  alone (PUZZLES.md, "Honest limit").
- Any new state needs a projection decision in `views.ts`. The secrecy spec
  lists the new keys.
