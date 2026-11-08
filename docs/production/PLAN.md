# Production sprint plan (branch production/ambitious-overhaul)

## Baseline (2026-11-04)
- `pnpm check:local`: 158/158 pass (unit, app, browser). Typecheck clean.
- Strengths: solid server sim, secrecy boundary, persistence, tests, readable controls.
- Weaknesses: rooms are bare boxes with flat-shaded walls, no machinery
  dressing, flat water plane, bridge windows show a flat sea, no post/IBL;
  disaster state mostly shown via HUD/lights, not the environment.

## Visual direction (decision)
Grounded industrial maritime, lit for drama. Alternatives considered:
stylised low-poly (current; cheap but reads as prototype), maritime horror
(fog/darkness hurts puzzle readability), external PBR asset packs (licence
review + download weight on a 256 MB Fly box). Chosen: keep procedural
geometry (zero licence risk, small bundle) but render it physically:
procedural normal/roughness maps (look/surfaces.ts), a dim compartment
environment map for reflections, bloom + grade + grain (look/PostFX.tsx),
dense purposeful dressing. Readability rule: dials, labels and glyphs
must stay legible in every screenshot; bloom threshold > 1 so only lamps,
screens and sparks glow.

## Workstreams and ownership (parallel agents, git worktrees)
| Agent | Owns | Delivers |
|---|---|---|
| env-engine | client/scene/engine/* (not Water/Effects), EngineRoom.tsx | Engine + Aux rebuild |
| env-bridge | client/scene/bridge/*, Bridge.tsx | Bridge + Comms rebuild, storm exterior |
| disaster-fx | client/scene/fx/*, engine/Water.tsx, engine/Effects.tsx, Player.tsx (camera) | water, leaks, smoke, roll, per-act atmosphere |
| gameplay | server/game/*, shared/* (reviewed by lead), spec unit tests | dynamic incident(s), interaction feedback |
| presentation | client/ui/*, client/audio.ts | landing, lobby, HUD, transitions, debrief, soundscape |
Lead owns client/scene/look/*, Scene.tsx, integration and docs.

## Risks
- Perf with post + more geometry on integrated GPUs → quality tier + auto step-down, instancing, merged statics.
- Agents colliding → strict ownership; mount points integrated by lead.
- Gameplay change breaking blind-play guarantees → blind-play sims must be extended and still fail.
