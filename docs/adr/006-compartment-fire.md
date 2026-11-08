# ADR 006 — A compartment fire as a dynamic cross-room incident

## Context
Acts III–IV had little unscripted pressure and every exchange was "read one
value aloud". The brief asked for one incident where each player holds half
of the information, server-authoritative, deterministic from seed and time,
and recoverable.

## Options
1. Burst pipe: Engineer sees steam at a valve, Bridge sees the location; one
   valve action. Too close to the existing flood loop and a single step.
2. Electrical fire (chosen): symptom class on the Engineer's panel, location
   and ordered procedure book on the Bridge, a four-step ordered action with
   a penalty for a wrong step.
3. Random events from a server RNG each tick: not reproducible from the seed.

## Decision
`config.incident` is generated from `seed ^ 0x1f1ef12e`, a separate RNG
stream, so existing seeds keep Acts I–V unchanged. It holds the compartment,
ignition time, the burning class, 5 isolator glyphs, 3 class glyphs (all eight
glyphs, no overlap) and one distinct 4-of-5 ordered procedure per class.

Time: a fire clock runs only in Acts III and IV (`ship.fire.clockS`), the fire
ignites at `atS` (30–60 s), grows `INCIDENT.growPerS` %/s and flashes over at
100. State is `ship.fire` and serialises with the voyage; `upgradeVoyage`
fills `ship.fire` and `config.incident` on old saves.

Rules (docs/SYSTEMS.md): intent `setIsolator {index, on}`, Engineer only,
RADIO/CASCADE/ESCAPE, set-semantics. `on:true` appends if it is the next step
of the burning class's procedure (a repeat is a no-op), otherwise the fire
flares (+40 %), the panel resets and locks for 8 s, danger +2. `on:false` is a
free re-arm. A complete procedure puts the fire out, danger -4. The panel
needs the grid up. While burning: +0.12 %/s inflow in that compartment; from
50 % intensity the generator derates by 1; danger accrues. Flashover: a
cracked seam (+0.08 %/s for good), danger +6. Nothing ends the voyage directly.

Secrecy (`views.ts`): the Engineer gets state, smoke, the class glyph, the
isolator glyphs and thrown flags. The Navigator gets state, compartment,
intensity, progress and the full procedure book (every class, unmarked). The
burning class is never in a Navigator view; the order never in the
Engineer's. Fx `{k:"fire", ev}` is shared and carries no secrets.

## Consequences
- Blind play is a guess over 5·4·3·2 = 120 orders per class: fixed sweeps put
  the fire out in about 1 % of 300 runs; a reactive prefix search in 1 of 60
  (most fire flash over). A talking crew puts it out first time on 60/60 seeds.
- Protocol change is additive: one intent, one Fx kind, a `fire` block on both
  views. No new reject reason (reuses `wrong-phase`, `grid-down`, `too-fast`).
- The class glyph gives the Bridge a lookup key but no direct answer, so the
  exchange needs two-way talk (glyph up, order down, progress up).
- Limitation: the Aux-room and Comms-room mounts are separate client work.
