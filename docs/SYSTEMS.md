# Ship systems and the five acts

The second production cycle turned the voyage into one continuous disaster
in five acts, driven by a server-side ship simulation. Numbers live in
`shared/config.ts` (`GRID`, `HULL`, `CASCADE`, `FINALE`, `MODE_RULES`); code
in `server/game/ship.ts` (continuous systems), `server/game/voyage.ts`
(reducer and transitions), `server/game/scenario.ts` (practice starts) and
`server/game/debrief.ts` (timeline and highlights). Per-puzzle rules stay in
`docs/PUZZLES.md`.

## Acts

| Act | Phase(s) | Rooms open | New system |
|---|---|---|---|
| I — Impact | PROLOGUE, POWER | Engine Room · Bridge | emergency bus, breakers |
| II — Stabilisation | FLOOD | + **Aux Machinery Room** (E) | water, pumps, valves, live grid |
| III — Mayday | RADIO | + **Comms Room** (B) | radio, circuits |
| IV — Cascade | CASCADE | all | breaches, coast-station calls, evac accumulator |
| V — Abandon Ship | ESCAPE | all | door rams, davits, synchronised abandon |

Rooms unlock by phase (`ROOM_UNLOCK` in `shared/protocol.ts`): the Aux
Machinery Room's bulkhead door opens when emergency power comes online; the
Comms Room's door opens when the distress phase begins. Each side stays one
role's: the Engineer never sees the Comms Room, the Bridge never sees the Aux
Machinery Room.

## The grid (from Act II)

The generator has an **output** (10, minus wear). Every Act I breaker trip
wears it by 1 (at most 2), and every later grid trip wears it by 1 more
(never below 6). The players can say: *"we're short on power now because we
tripped the breakers three times at the start."*

Loads: each running pump 2 · W/T radio 1 idle, 3 while transmitting or a
coast station is calling · engine-room lighting 1 · evac accumulator 4 while
charging, 1 when full · davits 3 once armed.

- Load above output heats the generator (9 %/s per unit over, ×mode). Within
  output it cools at 12 %/s. At 100 % it **trips**: the grid goes dead, no
  pump runs, the radio is silent, the accumulator loses 15 charge and armed
  davits drop. The Engineer must walk to the Aux Machinery Room and press
  RESET (allowed after 6 s). A tripped machine restarts hot (55 %).
- **Who sees what.** The Engineer sees the generator plant: total load, output
  and the heat gauge, plus the RESET button. The Bridge sees the distribution
  panel in the Comms Room: what each circuit draws, and the switches for
  LIGHTS / RADIO / EVAC. Neither alone knows both "how much headroom" and
  "where the load is".
- Pumps need the grid. With the grid down a pump switch stays on but nothing
  moves (non-return valves hold).

## Water (from Act II)

Each compartment gains `inflow` (seeded, ×mode), plus cracked seams (each
pump failure in this voyage adds 0.08 %/s to that compartment, at most 3),
plus Act IV breaches, plus the finale inflow during the escape. Once flood
control holds (Act II complete) damage control shores the hull: base inflow
× 0.35 thereafter.

- Pump on and valve open drains (4.2 %/s ×mode). Pump on and valve shut
  deadheads: line pressure climbs to a burst. Pump off and valve open
  backflows (3 %/s).
- A pump that keeps drawing on a compartment at or below 6 % for 1.5 s
  **seizes**: it trips off, cracks that seam and can't be restarted for 12 s.
  Only the Bridge's map shows levels, so the Engineer has to be told when to
  shut a valve.
- Flood control completes when all three compartments stay ≤ 20 % for 6 s.
- After Act II, a compartment that reaches 100 % is **lost**: +10 danger, it
  stays full for the rest of the voyage, and (Chain Reaction) leaks into its
  neighbours.
- Danger rises by 0.1 %/s × mean compartment level in every act with live
  water, so water left standing in Act III and IV costs time.

## Act IV — Cascade

Objective: charge the evac accumulator to 100 % (1.25 %/s while the EVAC
circuit is live), about 80 s of charging with nothing going wrong. Meanwhile:

- **Breaches.** Three seeded hull breaches (one per compartment, in seeded
  order, about 8 s, 34 s and 60 s in) each add 0.6–0.85 %/s of inflow. Only
  the Bridge's hull map shows where. Two pumps on the bus, three
  compartments: the pumps must follow the breaches.
- **Load.** EVAC (4) plus two pumps (4) plus RADIO (1) plus LIGHTS (1) is
  already the generator's full healthy output. A crew that tripped breakers
  in Act I must shed something. Engine-room lighting is the obvious candidate,
  and the Engineer then works by the emergency lamps.
- **Coast-station calls.** Twice a coast station calls (20 s window each).
  The Bridge's Comms Room shows the caller's bearing. The Engineer must aim
  the antenna there, the RADIO circuit must be live (3 load while ringing),
  and the Bridge answers. Each answered call cuts the escape's danger rate
  by 12 %. A wrong answer or a missed call costs danger.
- Completing the act: −10 danger.

## Compartment fire (Acts III–IV)

A seeded incident (`config.incident`, ADR 006). A fire clock runs only in
Acts III and IV; at 30–60 s a fire breaks out in one compartment and grows
1.2 %/s. Each seat holds half of it:

- **Engineer (Aux Machinery, fire panel)** sees the smoke thickness, a
  **class glyph** (one of three) and five glyph-marked isolator switches.
  Never where it burns, never the order. `setIsolator {index, on}`.
- **Bridge (Comms Room, fire card)** sees the compartment, intensity,
  progress and the **procedure book**: for every class glyph, the four
  isolator glyphs to throw, in order. Never which class is burning.

The Engineer reads the class glyph aloud, the Bridge reads back the order,
the Engineer throws it. A wrong throw flares the fire (+40 %), resets the
panel and locks it for 8 s, danger +2. `on:false` re-arms for free. Four
right throws put it out (danger −4). Needs the grid up. While burning: +0.12
%/s inflow in that compartment, and from 50 % intensity the generator
derates by one. At 100 % it flashes over: a permanently cracked seam and
danger +6. Never an instant loss. Tunables: `INCIDENT` in `shared/config.ts`.

## Act V — Abandon Ship

The door-ram puzzle (PUZZLES.md) plus:

- The water keeps coming (+0.2 %/s in every compartment), so pumps and grid
  still matter, and a trip mid-escape drops the davits.
- **Davits.** The Bridge arms the lifeboat davits in the Comms Room. That
  needs the EVAC circuit live and ≥ 50 % charge, and adds 3 load. With EVAC
  off, charge drains 1.5 %/s; at 0 the davits drop.
- ABANDON is refused (`davits-not-armed`) until the davits are armed. The
  synchronised pull then works as before.
- Escape margin = seconds of water left at the moment of escape (debrief).

## Modes

Standard is canonical. Surviving it unlocks Rough Seas, Blackout, Rapid
Flood and Chain Reaction for the crew. Surviving two of those unlocks All
Systems. Modes only scale the systems above (`MODE_RULES`); they never add
rules of their own.

## Practice

Once a crew has reached an act on a full voyage, they can start a
**practice** run from it. The earlier acts are set up as a clean crew would
leave them (`scenario.ts`, built from the voyage's own seed). Practice runs
are labelled PRACTICE everywhere, never count as a full victory, never
unlock anything and are excluded from the Log's fastest escape.

## Crews and unlocks

A pair's voyages share a `crew_id`: Sail Again keeps it, and creating a new
voyage from a browser that holds a seat in an earlier one inherits it.
Unlocks are computed from that crew's recorded voyages in SQLite.
