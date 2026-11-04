# Puzzles

The authoritative specification of every phase. The voyage's five acts and
the continuous ship systems (grid, water, hull, modes, practice) that run
underneath these puzzles are in `docs/SYSTEMS.md`. Server code in
`server/game/` implements exactly this; numbers live in `shared/config.ts`.
If you change a rule, change it here first.

Conventions:

- **E** = Engineer (Engine Room). **B** = Radio Officer / Navigator (Bridge).
- *Glyphs* are drawn symbols with no printed name: anchor, gear, bolt, wave,
  star, crescent, trident, bell. Players must describe shapes, which is the
  point. Glyph shapes are never distinguished by colour alone.
- Every puzzle is generated from the voyage's `seed`, so a replay is a
  different puzzle and solutions cannot be memorised or shared.
- All intents are **idempotent set-operations** (`setBreaker {i, closed}`),
  never toggles, so a duplicate click or a retried packet cannot flip state.
- "Danger" is the ship-wide flood level (0–100). At 100 the voyage is LOST.

---

## Prologue — "Dead Ship" (~30–60 s)

Teaches look/move/interact and, above all, *my action changed your room*.
Danger does not rise.

| | Engineer | Bridge |
|---|---|---|
| Sees | Dark room, red strobe, klaxon. A big labelled **EMERGENCY BUS** lever glowing beside the switchboard. A dark **BRIDGE LINK** lamp. | Dead consoles, red strobe. One dark **ALARM ACKNOWLEDGE** button. A text plate: "Consoles dead — Engine Room must restore emergency bus." |
| Controls | EMERGENCY BUS lever (`prologueBreaker`) | ALARM ACKNOWLEDGE (`prologueAck`) |

Loop: E pulls lever → B's consoles boot with a sweep of light and relay
clicks → B presses ACKNOWLEDGE (rejected while dead) → E's klaxon stops and the
BRIDGE LINK lamp lights. Both rooms flash "FLOODING DETECTED".

- State: `prologue.busOn`, `prologue.acknowledged`.
- Invalid: B acknowledging before bus is on → rejected `consoles-dead`
  (B sees "No power" feedback). E pulling the lever again → no-op.
- Complete: `busOn && acknowledged` → POWER.

---

## Phase 1 — Emergency Power (~2–4 min)

Teaches asymmetric information: E has the physical facts, B has the
relationships.

**Generated config:** 6 breakers, each `{glyph, load ∈ 1..3}`. Three required
systems — BILGE PUMPS, RADIO MAST, HELM — each fed by either of two breakers
(the 6 breakers are partitioned into 3 pairs). One breaker is **shorted**.
Generator `capacity` equals the load of the unique valid selection (one feeder
per system, shorted excluded, minimum total); the generator verifies by brute
force that exactly one selection of breakers powers all three systems within
capacity without the shorted one. The answer is never three neighbouring
breakers. (A reliability spec found that ~5% of seeds had the answer
{1, 2, 3}, so closing breakers left to right solved Power with no
communication at all.)

| | Engineer | Bridge |
|---|---|---|
| Sees | Switchboard: 6 breakers in a row, each with a glyph plate and **load pips** (●●○). Generator **load meter** with a numbered scale (no rating marked). TRIPPED lamp. | Damaged **routing diagram**: each system drawn with lines to the two glyphs that can feed it, one glyph stamped with a ⚡ **SHORTED – DO NOT ENERGISE** mark. Three **system lamps** (PUMPS / RADIO / HELM) that light when fed. The **generator rating** ("TOTAL LOAD ≤ 5"). No loads. |
| Controls | Each breaker: `setBreaker {index, closed}` | none (pure interpretation) |

Communication loop: B describes a glyph shape → E finds it, reports its pips
and the meter → B reasons about alternatives → E closes/opens.
("Pumps can use the wave or the trident." "Trident is three pips, I'm at 5 of
6." "Then try the wave instead.")

Rules (server):

- Load = Σ load of closed breakers. A system is *fed* when either feeder is
  closed and the generator is not tripped.
- Closing the shorted breaker → **trip** with `cause: short`, danger +4.
- Load > capacity → **trip** with `cause: overload`, danger +3.
- Three (or more) breakers closed that don't feed every system → **trip**
  with `cause: backfeed`, danger +3. Without this rule an Engineer could
  sweep the within-capacity combinations alone at no cost (measured:
  avg ~1.6 trips per solve). Each wrong guess now costs a trip.
- The generator rating lives on the **Bridge**, not the Engineer's meter.
  With the rating on the meter, the Engineer had only ~3 candidate
  combinations and could still brute-force Power alone. Without it, the
  Bridge has the pairings, the short and the rating, and the Engineer has
  the loads. Neither half is enough on its own.
- **Honest limit.** Power is *expensive* to solve alone, not impossible: an
  Engineer guessing cheapest-first averages ~3 trips (≈ 9–12 danger, ~20 s
  of lockouts) against 0 for a pair who talk. Making it strictly unsolvable
  would need hiding the loads too, and then the Engineer would have nothing
  to say. Flood, Radio and Escape need both players' controls by
  construction.
- Trip: all breakers forced open; `trippedUntil = now + 6 s`; `setBreaker`
  closing is rejected `generator-tripped` until then (opening is allowed).
  E sees TRIPPED lamp and sparks, B sees consoles flicker and lamps die.
- Complete: all three systems fed, not tripped, load ≤ capacity. Because the
  selection is unique, that is the solution. Danger −5.
- Payoff: engine-room lights go from red to warm working light, generator
  spins up; Bridge consoles fully light and the damage-control panel boots.

---

## Phase 2 — Flood Control (~3–4 min)

Both players actively manipulate a coupled live system.

**Generated config:** three compartments — FORE HOLD, CARGO, ENGINE BAY —
with seeded starting levels (55–75) and inflow rates. Three pumps, each with a
glyph. A hidden permutation `pumpTo[pump] = compartment` (the pipework).

| | Engineer | Bridge |
|---|---|---|
| Sees | Manifold with three **suction valves**, each stencilled with its compartment name, each with a **line-pressure gauge** (centre zero: deadhead pressure up, backflow down). Actual water on the engine-room floor = ENGINE BAY level. | **Damage-control map** of the hull with the three compartment levels and trend arrows (▲ rising / ▼ falling). Three **pump switches** labelled only by glyph. Pump bus: "MAX 2 PUMPS". |
| Controls | `setValve {compartment, open}` | `setPump {pump, on}` |

The pump→compartment mapping is unknown to both. It is discovered through
cross-room causality: B starts a pump, E sees one gauge climb ("your switch
just moved my CARGO gauge").

Rules (server, per tick):

- At most 2 pumps on; a third `setPump on` is rejected `pump-bus-limit`.
- For compartment *c* served by pump *p*:
  - pump on, valve open → **draining**: level −= `drainRate`·dt.
  - pump on, valve shut → **deadhead**: line pressure rises 18/s. At 100 the
    relief valve bursts: steam in engine room, pump *p* trips off (B sees
    its switch drop), pressure resets, danger +3.
  - pump off, valve open → **backflow**: level += `backflowRate`·dt and the
    gauge reads negative.
  - otherwise pressure relaxes toward 0.
- Every compartment also gains `inflow[c]`·dt. Levels clamp 0–100.
- Ship danger rises faster the fuller the compartments are (see GAME_DESIGN).
- **Running dry**: a pump drawing on a compartment at or below 6 % for 1.5 s
  seizes. It trips off, cracks that compartment's seam (+0.08 %/s inflow for
  the rest of the voyage, see SYSTEMS.md) and can't restart for 12 s
  (`pump-seized`). Only the Bridge's map shows levels, so the Bridge must
  call "shut it" in time.
- Complete: all three levels ≤ 20 **held for 6 s**. Because only two pumps
  run at once, players must drain two, then hand a pump over to the third —
  a coordinated switch (shut valve / stop pump / start pump / open valve).
  Danger −20. Damage control shores the hull (base inflow × 0.35), but the
  water stays live: pumps and valves keep working, and mattering, through
  Acts III–V.

Recoverability: any configuration can be undone; bursts only cost danger and
time.

Tuning note: backflow is 3 %/s. At the first value (1.2 %/s), "open every
valve and rotate the pumps" drained the ship with no communication on 40/40
simulated seeds. At 3 %/s that blind strategy fails 40/40, while a pair who
match valves to the running pumps succeeds 40/40.

**Honest limit (found in the second production cycle).** A *reactive*
blind strategy still wins: the Engineer opens a valve whenever its gauge
shows deadhead and shuts it whenever it shows backflow, while the Bridge
rotates pumps blind. The gauge tells the Engineer which pumps run. It won
40/40 simulated seeds at no cost. The running-dry and hold rules make it
**expensive**: about 10 danger more than a talking crew (net −9 against
−18 after the phase's relief) and slower. It is still possible. Like Power,
Flood is costly alone, not impossible. Hiding the gauge would leave the
Engineer nothing to report.

---

## Phase 3 — Distress Signal (~2–4 min)

Two interpretive loops in sequence.

**Generated config:** resonance channel `r ∈ 4..19` (of 0–23). Five shore
stations, each `{glyph, pattern, bearing}` with distinct 3–4 pulse patterns of
short/long and distinct bearings from the 8 compass points. One target
station.

### 3a Tune the carrier

| | Engineer | Bridge |
|---|---|---|
| Sees | **Resonance meter** on the transmitter (needle rises as the channel nears resonance) and a **LOCK** lamp lit only at exact resonance. | Tuning dial and frequency readout (2.00–7.75 MHz). Waveform display (static). No resonance feedback. |
| Controls | **COUPLE** lever `couple` | Tune ◄ / ► `tune {channel}` |

Loop: "warmer / colder" → LOCK lamp lit → E pulls COUPLE. Coupling off
resonance arcs (danger +2, `arc` fx) and is otherwise harmless.
Locked → tuning freezes, B's waveform shows a clean carrier.

### 3b Raise the right station

| | Engineer | Bridge |
|---|---|---|
| Sees | **Pulse lamp** blinking the answering station's pattern (with an optional matching beep). **Antenna rotator** with compass rose (N, NE … NW). | **Station chart**: five glyphs placed at their bearings around the ship. **Codebook**: each glyph with its pulse diagram (▬ • •). **Signal meter**: strong whenever the antenna points at *any* station. TRANSMIT button. |
| Controls | Rotate antenna `setAntenna {bearing}` | `transmit` |

Loop: E describes rhythm ("long, short, short, long") → B matches it in the
codebook and reads the bearing from the chart → B directs E's antenna and
watches the signal meter → B transmits.

- Transmit aimed at the target → **contact**: radio response voice line/text,
  complete. Danger −5.
- Aimed at a different station → "Station replies: cannot assist", danger +3.
- Aimed at empty sea → "No carrier", danger +1.
- Signal strength being high for every station is deliberate: sweeping the
  antenna cannot substitute for identifying the pulse.
- Blind play (step every channel and couple each time, then sweep every
  bearing and transmit each time) costs ~22 danger on average (simulated
  over 200 seeds). A pair who talk spends ~0.

---

## Act IV — Cascade (~2–3 min)

Previously learned systems at once. Full rules: docs/SYSTEMS.md.

**Generated config** (`config.cascade`): three breaches (one per
compartment, seeded order and timing, 0.6–0.85 %/s each), and two
coast-station calls from seeded bearings that hold no Act III station.

| | Engineer | Bridge |
|---|---|---|
| Sees | Generator plant (Aux Machinery): load, output, heat, wear, TRIPPED. Valve gauges. Antenna rotator. A CALLING lamp. | Hull map with breaches and levels. Distribution panel: what each circuit draws. Accumulator charge. Caller's bearing and time left. |
| Controls | `setValve`, `gridReset`, `setAntenna` | `setPump`, `setCircuit {LIGHTS, RADIO, EVAC}`, `answerCall` |

- Complete: accumulator reaches 100 % (1.25 %/s while EVAC is live and the
  grid is up). Danger −10.
- `answerCall` succeeds only with the antenna on the caller's bearing and the
  RADIO circuit on. Wrong bearing: danger +3, call lost. Unanswered for 20 s:
  missed.
- Blind play (EVAC on, pumps parked, never shedding load) loses compartments
  and trips the grid (unit test `charging blind … does not finish cleanly`).
  The caller's bearing exists only in the Bridge's view; the heat and output
  only in the Engineer's.

---

## Incident — Compartment fire (Acts III–IV, optional to survive)

Rules in docs/SYSTEMS.md "Compartment fire". Hidden config
(`config.incident`): compartment, ignition time, burning class, 5 isolator
glyphs, 3 class glyphs and a distinct 4-of-5 order per class.

| | Engineer | Bridge |
|---|---|---|
| Sees | Smoke %, class glyph, isolator glyphs and thrown flags | Compartment, intensity, progress, the book of orders for all three classes |
| Controls | `setIsolator {index, on}` (set, never toggle) | none: it reads and instructs |

Blind play: 120 possible orders per class and a wrong throw flares and locks
the panel. Unit tests (`spec/incident.unit.test.ts`): fixed sweeps put it out
in about 1 % of runs, a reactive prefix search in about 2 %; a talking crew
60 of 60.

---

## Final Escape (~60–120 s)

Genuine synchronisation under rising water.

**Generated config:** hydraulic band `[min, min+20]`, `min ∈ {40, 50, 60}`.

| | Engineer | Bridge |
|---|---|---|
| Sees | **Hydraulic gauge** with numbers 0–100 but no band marks. The watertight escape door at the end of the room. Partner-ready lamp. | **Door-ram panel**: required band ("RAMS REQUIRE 50–70"), a LOW / OK / HIGH lamp, door progress. Partner-ready lamp. |
| Controls | **Hand pump** `pumpStroke` (+9 per stroke, server rate-limited), ABANDON lever `abandon` | **DOOR RELEASE** (hold) `holdDoor {held}`, ABANDON lever `abandon` |

1. **Pressurise**: B tells E the band; E strokes the pump. Pressure decays
   1.5/s idle, 4/s while the door moves. Above 95 the relief vents (pressure
   → 30, steam).
2. **Open the door**: door progress += 10 %/s only while B holds RELEASE *and*
   pressure is in band. Both see the door move (E physically, B on the panel).
   Progress is kept when interrupted. **Above the band with release held,
   the rams slip and the door closes at 15 %/s** (B's panel: "RAMS SLIPPING").
   Without this, holding release and pumping blindly opened the door every
   time with no talking (simulated: 60/60 seeds). With it, blind pumping
   fails 60/60, and a pair calling "more / stop" opens it in 13–22 s.
3. **Davits**: the Bridge arms the lifeboat davits in the Comms Room
   (`armDavits`: needs the EVAC circuit live and ≥ 50 % charge; +3 load).
   ABANDON is refused (`davits-not-armed`) until they are armed. A grid trip,
   or the accumulator draining to 0 with EVAC off, drops them.
4. **Abandon ship**: once the door is fully open, each player pulls their
   ABANDON lever. If both pulls land within a 3-second window → SURVIVED. A lone
   pull resets after 3 s with no penalty; partner lamp shows it.

Danger rises fast here; the phase is paced to be exciting, not punishing.

---

## Endings

- **SURVIVED**: alarms change tone, door slams open, a short exterior
  cinematic of the lifeboat pulling clear of the listing ship, then the
  summary and the incident reconstruction (docs/SYSTEMS.md).
- **LOST**: danger reached 100. Brief blackout/flood ending naming the cause:

| Phase at loss | Failure cause |
|---|---|
| POWER | Emergency power never came online |
| FLOOD | Flood control collapsed |
| RADIO | No distress call reached shore |
| CASCADE | The ship's systems failed one after another |
| ESCAPE | The escape route flooded |

Both endings offer one-click **Sail again** (new voyage, same crew and roles,
new seed) and a link to the Ship's Log.

## Server validation summary

Every intent is checked in this order, and rejected with a reason code that
the client shows as brief feedback (never a stack trace):

1. Socket is bound to a seat in this voyage (`not-seated`).
2. Voyage phase is the phase this intent belongs to (`wrong-phase`).
3. Sender's role owns this control (`wrong-role`).
4. Payload is in range (`bad-input`).
5. Puzzle-specific rule (`generator-tripped`, `pump-bus-limit`,
   `consoles-dead`, `carrier-locked`, `door-not-open`, …).

No intent can assert completion. Completion predicates are evaluated by the
server after every applied intent and every tick, and the phase transition
function is guarded so it fires exactly once.
