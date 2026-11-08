# Product

## Premise

A cargo ship has been holed in a collision and is sinking. Two crew members
are sealed in separate compartments: the **Engineer** in the Engine Room and
the **Radio Officer / Navigator** on the Bridge. Neither can save the ship
alone. They talk (outside the app — voice call or the same room) and work the
ship's systems together until both can abandon ship.

## Target experience

confusion → discovery → "wait, your controls affect my room" →
interdependence → coordination → rising pressure → synchronised escape.

A full voyage: five acts, about 15–20 minutes once a crew knows the ship.
A first escape is expected to take a few attempts; early acts get much
faster with mastery. Desktop browser, mouse and keyboard.

## Definition of good

> A good cooperative puzzle game creates moments in which two people
> genuinely need one another.

1. **Necessary asymmetry** — neither player has all the information and
   controls for any core puzzle.
2. **Cross-room causality** — important actions have immediate perceptible
   consequences in the other room.
3. **Communication through interpretation** — describing shapes, rhythms,
   bearings and gauge behaviour, not reading out codes.
4. **Pressure without cruelty** — rising water, but time to learn, attributable
   failure, and instant retry.
5. **Dense over large** — two small rooms where every interactable matters.
6. **Shared consequences** — the real-time architecture is the game design.
7. **Legibility** — a stranger at `/readme/` or `/` knows within a minute what
   this is, that it needs two people, and how to start.

## Scope

Exactly two roles; one ship; four compact rooms (Engine Room and Aux
Machinery for the Engineer; Bridge and Comms Room for the Navigator), the
second room on each side unlocking mid-voyage; five acts (Impact,
Stabilisation, Mayday, Cascade, Abandon Ship) over a continuous ship
simulation (grid, water, hull); success and failure endings with cinematic
bookends; an incident-reconstruction debrief; persistent voyage log;
replay (new ship or same ship); unlockable challenge modes; practice from a
reached act. See docs/SYSTEMS.md.

## Non-goals

Combat, NPCs, procedural worlds, inventories, crafting, accounts, built-in
voice or text chat, avatars of the other player, matchmaking, more than two
players, large downloaded assets. (Touch play on phones and tablets was a
non-goal until ADR 008; it now drives the same rooms with on-screen controls.)

## Success criteria

- Two fresh browser profiles can create/join and are given different roles.
- Every core puzzle is impossible to solve from one seat (verified by design
  review of PUZZLES.md and by the view-secrecy tests).
- A control change in one room is visible in the other within ~1 s.
- Refresh, reconnect and server restart all restore the voyage.
- The voyage log shows completed voyages after a restart.
- A pair escapes within a few attempts, and later attempts are visibly faster (qualitative; needs playtest).
