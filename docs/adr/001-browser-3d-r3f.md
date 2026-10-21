# ADR 001 — Browser 3D with React Three Fiber

## Context
The game needs two small first-person rooms full of legible controls, plus
HTML overlays (lobby, HUD, endings). It must load fast on an ordinary laptop
and deploy as one Node process.

## Options
1. Vanilla Three.js with hand-written DOM overlays.
2. React + React Three Fiber (+ drei helpers) for both scene and overlay.
3. A game engine (PlayCanvas, Babylon) — heavier, editor-centric.

## Decision
React + R3F. Interactables become declarative components bound to the store,
overlays and scene share one state source, and drei provides pointer-lock
controls and text without extra assets.

## Consequences
Per-frame work must avoid React re-renders (read the store in `useFrame`).
Bundle is larger than vanilla Three; acceptable for a desktop-first game.
