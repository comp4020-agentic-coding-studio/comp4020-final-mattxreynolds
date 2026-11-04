# Gameplay audit (second production cycle)

Method: read `docs/PUZZLES.md`, `SYSTEMS.md`, `server/game/*`, `shared/config.ts`
and the unit specs. Blind-play numbers for the new fire are in ADR 006.

## Act by act (E = Engineer, B = Bridge)

**Act I Impact (prologue + power).** Dependency: strong. B alone holds the
routing diagram, shorted breaker and capacity (`views.ts` `power.*`); E holds
loads. The backfeed rule (`voyage.ts` setBreaker) stops guessing. Bypass: with
6 breakers a patient E can brute-force, but every trip wears the generator for
the voyage (`GRID.wearPerPowerTrip`). Repetition: seeded, low. Curve: gentle by
design, the right opener.

**Act II Stabilisation (flood).** Dependency: strong, with an honest limit
recorded in PUZZLES.md: a reactive E watching one gauge can partly self-solve
(the dry-run seize rule, `FLOOD.dryAt`, exists to stop this). Asymmetry: B sees
levels and runs pumps, E owns valves and pressure; the pump-to-compartment
wiring is never sent. Risk: after the first minute the loop is "follow the two
fullest tanks", the same rhythm for about 4 min. Curve: first real spike.

**Act III Mayday (radio).** Dependency: strong. Resonance (E meter) vs channel
(B dial); pulse (E lamp) vs codebook (B) vs bearing (E antenna). Blind
transmitting is costly (`RADIO.dangerWrongStation`). Weakness: the flattest act.
Water is already shored (`HULL.shored`) and `DANGER.rate.RADIO` is 0.07, so
nothing happens to the ship while the crew tunes. The fire lands here to fix it.

**Act IV Cascade.** Dependency: strongest. Breaches visible to B only; per-circuit
draw to B, output and heat to E only (`gridDraw` vs `gridOutput`); caller
bearing B-only, antenna E-only. Blind play is already tested (`charging blind`
in `systems.unit.test.ts`). Weakness: breaches and calls are a fixed-size list
(`CASCADE.breaches`, `calls`), identical on a replay of the same seed.

**Act V Abandon Ship.** Dependency: strong. Band is B-only, pump strokes E-only,
the slip rule punishes blind pumping, and the joint 3 s abandon window is a
clean finale. No bypass found. Weakness: 60 to 120 s of one repeated mechanic.

## Cross-cutting findings

1. **Information is exchanged, not negotiated.** Nearly every puzzle is "read one
   value aloud, then the other seat acts". There was no multi-step, two-way
   exchange with error recovery. The fire adds one (class mark up, procedure
   down, progress back).
2. **Difficulty curve.** `DANGER.rate` climbs 0.03 (Act II) to 0.3 (Act V) but
   dips at Act III; Acts II and III have long stretches where nothing new
   happens to the ship.
3. **Consequences are persistent and legible** (`powerTrips`, seams, lost
   compartments, `callsAnswered`) and each is explained in the debrief. Good.
4. **Repetition.** Seeds vary values, not shapes; a second voyage has the same
   structure. Modes (`MODE_RULES`) scale numbers, not structure.
5. **Bypass check.** Every intent is role- and phase-gated through
   `INTENT_RULES` with own-key lookup; none asserts completion. The one known
   solo-solvable path is the Act II reactive valve strategy already noted.
6. **Gap addressed here:** an unscripted-feeling mid-voyage event needing both
   rooms to talk in an order neither can derive alone: the compartment fire
   (ADR 006). Engineer acts, Bridge reads, recoverable, never an instant loss.
