# Visual direction

**Grounded industrial maritime, lit for drama.** (Revised in the production
sprint; the first two cycles were "stylised low-poly". See ADR 007.)

Geometry is still procedural (boxes, cylinders, tori, extrusions, merged
per material) with canvas-drawn labels, diagrams and dials, so there are no
downloaded asset packs, no licence questions and a small bundle. What
changed is how it is rendered and how densely it is dressed:

- **Physically based surfaces.** `client/scene/look/surfaces.ts` generates
  painted-steel (orange peel, chips, drip streaks) and diamond tread-plate
  normal and roughness maps on canvases at load time, applied to the shared
  kit materials with `dressStd`.
- **Reflections.** `look/PostFX.tsx` builds a dim steel-compartment
  environment map (PMREM) so metals, enamel, glass and water have something
  plausible to reflect. A studio environment was tried first and rejected:
  its light boxes blew out wet decks and dial glass.
- **Camera look.** Bloom (threshold above 1, so only lamps, screens and
  sparks glow), a grade pass with cold shadows, warm highlights, vignette
  and film grain, and a red edge tint that rises with danger. Rooms write the
  live `grade` object (`alarm`, `dark`, `bloom`) from `useFrame`.
- **Readability rule.** Dials, labels and glyph plates must stay legible in
  every act. Bloom and grade were retuned twice against screenshots to keep
  dial faces and glyph plates readable.

## Quality tiers

`high` gets the environment map, relief maps, bloom and grade at full dpr.
`low` gets plain materials, no post and a lower dpr. Software rasterisers
(SwiftShader, llvmpipe) default to `low`: profiling showed the PMREM and
relief shader variants linking about 100× slower there, which froze each
page for 4–6 s just after the room mounted. A sustained low frame rate
steps down once. The pause card has a Graphics High/Low toggle.

## Engine Room and Aux Machinery

Low ceiling, frames and deck beams, lagged steam headers with flanges,
hangers and an in-line valve, cable trays, ventilation trunking, ladders to
a skylight hatch, lube-oil tanks, a workbench with tools, lifejacket
lockers, extinguishers, frame numbers, hazard signage, and a crew watch
bill. Generators have rocker covers, injector lines and exhaust rails.
Stations keep their layout: emergency bus panel, switchboard, status board
and transmitter on the north wall; generator No.1 west; bilge manifold
south; repeater, hand pump, escape door and abandon lever east. The Aux
room has the plant panel, generator No.2 and the fire panel.

## Bridge and Comms Room

The windows look onto a stormy night. A sky dome has scudding cloud (an fbm
shader), the sea is a vertex-displaced shader plane with foam crests, and
there is rain in the air and on the glass. The foredeck with containers and
a foremast pitches and rolls. Lightning lights the sky, the sea and the
room. Storm strength follows the act and danger. Inside: helm, engine-order
telegraph and binnacle (all plated LOCKED, so they don't read as controls),
a chart counter with instruments, a deckhead with beams and cable trays,
and lockers. The Comms Room has a radio rack (STOWED, NO CONTROLS), a
battery cabinet and the damage-control fire card.

## Disaster, by state

Everything is driven by the role's view; nothing client-side decides
outcomes.

- Water: a shader surface with animated normals, fresnel depth, a foam band
  at the walls, caustics on the floor and floating debris. The level follows
  the ENGINE BAY level.
- Hull spray from breaches, pipe drips (rate rises with danger), steam leaks
  and smoke haze with generator heat, sparks on trips and overload, and
  brown-outs when load jumps.
- The camera rolls and pitches with act and danger (at most about 3°) and
  jolts on breaches. All of this is off under reduced motion.
- Each act escalates: Act I is dim and uncertain; red edge tint and faster
  alarm pulses come later; the grid going down or the voyage being LOST
  darkens the frame.

## Lighting

- Prologue: dim with a red rotating beacon and a strobing alarm lamp, but
  the key control is self-lit, so the room is never pitch black.
- After power: warm working light; lamps glow; emergency red reduced to
  accents.
- Lights shed or grid down: working fittings dark, red emergency lamps.
- Danger: flicker frequency and red tint scale with danger.
- There is always a hemisphere fill, so nothing important is unreadable.

## UI

A stencil display face (Stardos Stencil) and a technical mono (Share Tech
Mono) carry a hull-plate identity on the landing page. The HUD has an act
plate with the objective, a SHIP DANGER gauge with a trend mark and
percentage (▲ RISING / ✖ CRITICAL / ▬ HOLDING, never colour alone), act
title cards on phase change (about 2.5 s, non-blocking), and a prompt line
with an [E] marker.

## Sound (WebAudio, procedural)

- An act-dependent ambient bed: a drone and wind that grow more urgent from
  Act I to Act V.
- Water rush scaled by danger, random hull creaks that come more often as
  danger rises, and distant thunder.
- Equipment: breaker clunks with a mechanical tail, valve squeal, radio
  static sweeps, and fire cues.
- Act stingers and an outcome cue.
- Every puzzle-critical sound has a visual twin.

## Accessibility and readability

Shapes before colour, labels on every control, and prompts that name the
control and its current state ("Breaker ⚓ — CLOSED · E to open").
Reduced motion turns off roll, jolts, strobe, lightning and pitching.
