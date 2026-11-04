# Dev mode

Test the whole game from **one browser** while developing. On by default
under `pnpm dev`; absent from production builds.

## Use

1. `pnpm dev`, open `http://localhost:8080/`.
2. **Start dev voyage** (dashed card on the home page). You hold both seats.
3. **Ready both seats** in the panel (top right) → the voyage starts.

| Control | What it does |
| --- | --- |
| `F2` / *Switch to …* | Swap between Engineer and Radio Officer in place (works with the pointer locked) |
| *Skip PHASE* | Solve the current phase server-side and advance normally |
| *Danger* slider | Set ship danger (0–99%) |
| *Sink the ship* | Lose immediately (tests the LOST ending) |
| `` ` `` | Hide/show the panel |

Lobby settings (start act, mode) are all unlocked on a dev voyage, so
you can start practice at any act or pick any challenge mode. *Sail again*
keeps both seats.

## How it works

- `POST /api/dev/voyages` creates a voyage with both seats filled and returns
  both seat tokens. The client stores them in localStorage (`btw.dev.CODE`).
- The partner seat stays connected on a **second socket**, so the server sees
  two present crew: no pause, real presence, real per-role views. Switching
  seat only swaps which socket feeds the UI; nothing reconnects. The secrecy
  boundary (`views.ts`) is unchanged; each socket still gets only its role's
  view.
- `POST /api/dev/voyages/:code/action` (`skip` / `danger` / `lose`) requires
  one of the voyage's seat tokens. *Skip* never sets `v.phase`: it satisfies
  the phase's own completion condition (`server/game/dev.ts`) and lets
  `checkProgress` → `advance` make the transition, so it fires once and is
  logged (`[dev] skipped …`) like any other.

## Gating

- Enabled when `NODE_ENV !== "production"` unless `ENABLE_DEV_TOOLS=0`.
- In production only with `ENABLE_DEV_TOOLS=1` (the spec does this on a
  throwaway server). The Dockerfile and fly.toml never set it.
- `/api/dev/status` always answers (`{dev:false}` when off) so the home page
  never logs a 404; the other `/api/dev` routes don't exist when off.
- `spec/dev-mode.test.ts` asserts the app under test has dev mode off.
