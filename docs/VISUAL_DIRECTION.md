# Visual direction

**Stylised low-poly industrial maritime escape room.** Procedural geometry
only (boxes, cylinders, tori, extrusions) plus canvas-drawn textures for
labels, diagrams and dials. No downloaded asset packs.

## Palette and materials

- Bulkheads: desaturated sea-green/grey painted steel, darker lower band,
  rivet rows (instanced spheres).
- Pipes: cast iron dark grey; valve wheels red-painted with brass hubs.
- Controls: brass bezels, black enamel faces, cream dial faces with black
  numerals — legible at a metre.
- Warning: amber/black hazard stripes; red only for danger states.
- Text plates: cream on dark, stencil-like heavy sans.

## Engine Room

Low ceiling, generator block on one side, switchboard on the facing wall,
valve manifold with three gauges at the back, transmitter cabinet with pulse
lamp and antenna rotator, hand pump and watertight escape door at the far
end. Water plane on the floor rises with ENGINE BAY level / danger.

## Bridge

Wider, windows/portholes onto a dark stormy sea (fog + gradient), consoles
in an arc: routing diagram console, damage-control map, radio desk with
tuner and waveform, chart table with station chart and codebook, door-ram
panel by the aft bulkhead.

## Lighting

- Prologue: dim with red rotating beacon and strobing alarm lamp, but the
  key control is self-lit — never pitch black.
- After power: warm working light (key + fill), lamps glow; emergency red
  reduced to accents.
- Danger: flicker frequency and red tint scale with danger.
- Always a hemisphere fill so nothing important is unreadable.

## Atmosphere

Light exponential fog, steam bursts (sprite puffs) at valves, slow camera
roll with danger, gentle bob, dust motes. Water: translucent plane with
animated vertex ripple.

## UI

Overlay HTML in a restrained "ship's paperwork" style: off-white card,
navy/ink text, stencil headings, monospace data. HUD: phase + objective top
centre, FLOODING indicator top right, contextual prompt under the reticle,
connection/partner banner. No cluttered stats.

## Sound (WebAudio, procedural)

Engine rumble (filtered noise + low osc), alarm (two-tone), relay click,
electrical buzz, steam hiss, pump hum, water slosh, radio static, pulse
beeps, hull groan, door rumble, success swell. Starts on first user gesture;
mute toggle (M) and volume slider on the pause card.

## Accessibility & readability

Shapes before colour, labels on every control, prompts name the control and
its current state ("Breaker ⚓ — CLOSED · E to open").
