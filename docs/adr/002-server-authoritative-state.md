# ADR 002 — Server-authoritative state with per-role views

## Context
The game only works if each player lacks the other's information, and
completion must not be forgeable. Two clients act on the same machinery
simultaneously.

## Options
1. Peer-to-peer / client-authoritative with a relay.
2. Shared state broadcast to both clients, UI hides the other half.
3. Server owns state; clients send intents; server sends each role a
   projected view.

## Decision
Option 3, over Socket.IO. `server/game/views.ts` projects canonical state into
`EngineerView` / `NavigatorView`. Full snapshots (not deltas) are pushed on
every change, capped at 5 Hz for continuous values.

## Consequences
Hiding is real (inspecting network traffic does not reveal the partner's
diagram). Snapshots make reconnect trivial. Views are small (a few KB), so
snapshot bandwidth is negligible. Every state field needs a deliberate
projection decision.
