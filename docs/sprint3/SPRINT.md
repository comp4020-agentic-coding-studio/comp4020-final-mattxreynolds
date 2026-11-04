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
| start | $61.20 | $0 |

## Process registry
| pid/pgid | owner | purpose | port | status |
|---|---|---|---|---|
| (screenshot.ts spawns + kills its own server/browser per run) | | | 9100+ | |

## Workstreams
- P3 ocean in Bridge — lead
- P0 cinematics — 
- P1 room audit — 
- P2 QA — 

## Issue register
See ISSUES.md.

## Log
