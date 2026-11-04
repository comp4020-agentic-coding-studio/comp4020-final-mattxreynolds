# QA issue register (sprint 3)

Severity: Critical / High / Medium / Low. Source: agent QA (automated sims,
scripted browsers, screenshot inspection). No human playtesting.

| id | sev | location | description | status |
|---|---|---|---|---|
| WAVE-1 | High | client/scene/bridge/Exterior.tsx | exterior sea crests rose up to 1.32 m through the Bridge floor | fixed 1e91a6f, numeric + render verified |
| COOP-1 | Medium | server/game/voyage.ts tickEscape | Escape solvable blind by a reactive Engineer (76/100); hiding door progress doesn't help (sweep 60/60) | documented as honest limit in PUZZLES.md; rule change deferred to student playtests |
| COOP-2 | Medium | server/game/ship.ts / config CASCADE | Act IV reachable with an idle Engineer (100/100 all modes) | open — balance, needs student decision |
| COOP-3 | Medium | shared/config.ts MODES | scripted talking crew survives 60/60 on NIGHTMARE | open — balance, needs human playtest |
| COOP-4 | Low | server/manager.ts devAction | dev skip worked on non-dev voyages when dev tools on | fixed (gate on v.dev) + spec |
| COOP-5 | Low | ship.ts setIsolator / net.ts | fire panel lockout toasted "Steady strokes" | fixed: reason `panel-locked` |
| COOP-6 | Low | client/net.ts | grid-down message addressed the Engineer in 3rd person | fixed: role-neutral text |
| COOP-7 | Low | server/manager.ts unlocksFor | same-ship rerun wins count toward unlocks | won't fix overnight: design choice for student |
