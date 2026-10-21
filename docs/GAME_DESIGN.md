# Game design

## Player journey

1. **Home (`/`)** — title, one-paragraph premise, "needs two people talking",
   Create Voyage / Join Voyage, controls summary, links to Ship's Log and
   README.
2. **Lobby** — big voyage code + copy-link button, both callsigns with
   assigned roles and a one-line role description, connection dots, Ready.
3. **Briefing card** (on entering the 3D room) — your role, your room, the
   controls, "Click to take the helm" (pointer lock). Esc returns to it.
4. **Prologue → Power → Flood → Radio → Escape** — see PUZZLES.md.
5. **Ending** — Survived/Lost card with cause, duration, mistakes; Sail again;
   Ship's Log.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | move |
| Mouse | look (pointer lock) |
| E or left click | use the control under the reticle |
| Shift | walk faster |
| Esc | release mouse / pause card |
| R (on pause card) | return to spawn point if stuck |
| M | mute |

Hold-type controls (door release) are held with E or the mouse button.

## Room responsibilities

- **Engine Room** — the physical plant: switchboard, generator, valve
  manifold and gauges, transmitter coupler, pulse lamp, antenna rotator, hand
  pump, escape door. The Engineer *does* things and *reports what they see*.
- **Bridge** — the information: routing diagram, damage-control map, pump
  switches, radio tuner, station chart and codebook, door-ram panel. The
  Navigator *interprets* and *directs*, and owns a few controls whose effects
  appear in the engine room.

## Phase objective board

Each room has a small **status board** on the wall (diegetic) and the HUD
shows a one-line objective, e.g. "POWER — Restore feed to pumps, radio and
helm". It never gives the solution.

## Sinking pressure

Danger `d` ∈ 0–100 (ship-wide flooding). Per second:

| Phase | base rise/s |
|---|---|
| PROLOGUE | 0 |
| POWER | 0.08 |
| FLOOD | 0.04 + 0.12 × (mean compartment level / 100) |
| RADIO | 0.10 |
| ESCAPE | 0.35 |

Mistakes add a lump (listed per puzzle). Completing a phase reduces danger.
`d` starts at 10 after the prologue. Display: **FLOODING: STABLE** (rate
≤ 0.05/s), **RISING**, **CRITICAL** (d ≥ 75). Represented by: water plane
height in the engine room, a list (camera roll) that grows with `d`, hull
groans, alarm cadence, lamp flicker.

Balance target: a careful first-time pair with a few mistakes finishes with
`d` around 60–80. Worked estimate (3 min each on Power/Flood/Radio, 90 s
escape, ~12 min total): 10 + 14 + 20 + 18 + 31 − 30 relief ≈ 63, plus
mistakes ≈ 75. (The first draft rates gave ≈ 98, i.e. near-certain loss.) A pair that stalls for several minutes on one puzzle can
lose. Timings were chosen from the table (see `shared/config.ts`); they need
playtesting.

## Success / failure / retry

- Success requires both players' simultaneous final action.
- Failure always names the phase and cause. "Sail again" makes a fresh
  voyage for the same pair in one click by either player (partner follows
  automatically).

## Pause / disconnect

If either seat disconnects during play, the ship *holds*: no danger rise, no
timers, a banner tells the other player. This keeps failure attributable to
decisions, not Wi-Fi.

## Accessibility

- Glyphs are shapes; state is conveyed by labels, position, light pattern and
  motion as well as colour (lamps also say ON/OFF, trends are ▲/▼ arrows).
- Puzzle-critical sounds (pulse beeps) always have a visual equivalent (pulse
  lamp); the game is fully playable muted.
- `prefers-reduced-motion`: no camera list, no flicker strobe, softer flashes.
- Text ≥ 14 px in overlays, high-contrast panels; canvas textures drawn large.
- Keyboard: every overlay control is focusable; pointer lock is optional
  only in the sense that Esc always returns control.

## Interaction & feedback principles

- Every control animates locally the instant it is used, then settles to the
  server's state.
- A rejected intent shows a short diegetic reason ("Generator tripped —
  wait") near the reticle.
- Every cross-room effect has both a visual and a sound on the receiving
  side.
