# ADR 007 — A shared render look, with quality tiers

## Context
After two cycles the rooms played well but looked like a prototype: flat
shaded boxes in a uniform fill, no reflections, flat water, and a flat sea
outside the Bridge. The production sprint's top priority was a large,
visible improvement in all four rooms without losing puzzle readability or
the browser/Fly constraints (one 256 MB machine, players on laptops).

## Options
1. **External PBR asset packs** (ship interiors, machinery). These give the
   highest fidelity per hour, but need licence review per asset, add
   megabytes of download, and come in a mix of styles.
2. **Darker "maritime horror"** (heavy fog, sparse light). Cheap and moody,
   but it hides the dials and glyph plates the puzzles depend on.
3. **Keep procedural geometry and render it physically.** Procedural normal
   and roughness maps, an environment map for reflections, post-processing
   (bloom and grade), and dense dressing merged per material.

## Decision
Option 3. Shared look modules live in `client/scene/look/`: `surfaces.ts`
(canvas-generated relief maps), `PostFX.tsx` (a dim compartment environment
map plus an EffectComposer with bloom, a grade shader and output) and
`quality.ts` (tiers). Room agents dressed the spaces with merged and instanced
geometry, about 140 draw calls in the Engine Room and 225 on the Bridge
(SwiftShader measurement).

Quality tiers: `high` gets everything; `low` gets plain materials, no
environment map, no post and a lower dpr. Software rasterisers default to
`low`, and a sustained low frame rate steps down once.

## Evidence that forced the tiers
Measured in two SwiftShader browser contexts on the integration branch:
each page froze for 4.2 s (Engine Room) and 6.5 s (Bridge) shortly after
mounting. A CPU profile put 7 s inside `getShaderInfoLog` and
`getProgramInfoLog`, which were waiting on program links. Instrumenting
`getProgramParameter` showed standard-material links taking 100–800 ms each,
against no link over 30 ms on the baseline commit; the PMREM env path was the
largest share. Those freezes pushed view propagation past the 2 s budget
that `spec/browser-resilience.test.ts` enforces (invariant 3). With the low
tier skipping the env map and relief maps, the freezes dropped to 0.7 s and
1.6 s, and scene-ready time fell from 16.8 s to 7.5 s. The loading card also
now waits for every staged Bridge part to compile (`scene/loading.ts`).

## Consequences
- A GPU player sees the full look. A CPU-rendered player (and the test
  suite) sees the plainer tier, the same geometry and identical gameplay.
- Screenshots meant to show the look use `scripts/screenshot.ts --quality high`.
- New materials should be created through the kits (`M()`, `MAT`,
  `dressStd`) so the tier decision applies to them.
- Production skips three.js's shader info-log checks
  (`debug.checkShaderErrors = false`); development keeps them.
- Keep one persistent `<Canvas>` for the whole voyage, cinematics included
  (`Scene.tsx` swaps the content and a `Lens` sets the camera). Remounting it
  for the ending cinematic cost `forceContextLoss` 3.4 s plus `getContext`
  1 s on SwiftShader, which timed out the full-voyage spec.
