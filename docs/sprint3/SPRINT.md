# Sprint 3 — cinematic, visual polish, QA (branch production/cinematic-polish-qa)

Durable state for the overnight sprint. If context is lost, start here.

## Rules
- Browser renders are serialised: wrap every browser-launching command in
  `flock /tmp/btw-browser.lock <cmd>` (7 GB RAM box; SwiftShader is heavy).
- Screenshots: `docs/sprint3/shots/<topic>/` (gitignored bulk lives in /tmp/btw-shots).
- Every visual change: render → inspect → critique → fix → re-render.

## Budget ledger (strproxy /api/me, weekly cap $300)
| time | confirmed spend this week | sprint spend |
|---|---|---|
| start 22:10 | $61.20 | $0 |
| 23:15 | $75.12 | $13.92 (lag possible) |

## Process registry
| pid/pgid | owner | purpose | port | status |
|---|---|---|---|---|
| (screenshot.ts spawns + kills its own server/browser per run) | | | 9100+ | |

## Workstreams
- P3 ocean in Bridge — lead
- P0 cinematics — agent "cinematic" (worktree)
- P1 room audit — agents "bridge-audit", "engine-audit" (worktrees)
- P2 QA — agents qa-coop, qa-journey, qa-render (read-only reports → ISSUES.md by lead)

## Issue register
See ISSUES.md.

## Log
- 22:26 P3 fixed: 1e91a6f (sea mask under ship footprint; numeric check 1.32 m → -0.15 m; renders /tmp/btw-shots/wave).
- 22:30 Spawned: cinematic (worktree, Cinematic.tsx), bridge-audit (worktree, client/scene/bridge + Bridge.tsx),
  engine-audit (worktree, client/scene/engine + EngineRoom.tsx), QA-coop (read-only), QA-journey (read-only, browser),
  QA-render (read-only, browser). Ports: cinematic 9110-9119, bridge 9120-9129, engine 9130-9139, QA 9140-9169.
- 23:15 merged bridge-audit round 1 (bf6f213); sent round 2 (telegraph dial, full workstation audit). COOP fixes f3da2ff.
- 23:52 cinematic overhaul merged (d1effcf) after lead review of sheet-intro/sheet-endings; round 2 dispatched (CINE-1). Budget $81.28 (sprint ≈ $20).
- 00:05 engine round 2 merged + DOOR RAM plate lead fix; JOURNEY-4/5 closed; check:local 21 files / 208 tests PASS on 2d35967+.
- 00:55 cinematic round 2 merged after lead review; all agent worktrees removed; final check:local running.
