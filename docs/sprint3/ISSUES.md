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
| BRIDGE-1 | High | Bridge codebook | locker at codebook edge | fixed bf6f213 (lead-verified render) |
| BRIDGE-2 | High | routing diagram | SHORTED stamp over icons | fixed bf6f213 (lead-verified) |
| BRIDGE-3 | Medium | PowerConsole plates | rated plate overlapped HELM plate | fixed bf6f213 |
| BRIDGE-4 | Medium | engine telegraph dial | crushed labels, clipped plate | **fixed** 1169447 (5-label face, lead-verified) |
| COOP-7 | Low | server/manager.ts unlocksFor | same-ship rerun wins count toward unlocks | won't fix overnight: design choice for student |
| JOURNEY-1 | Medium | client/ui/styles.css .overlay | briefing card clipped top+bottom at 1024×640 (flex centring overflowed upward, out of scroll reach) | fixed + render verified (card y16–650 at 1024×640, volume row visible) |
| JOURNEY-2 | Medium | Game.tsx take-controls | "Lighting the lamps…" wait under SwiftShader | by design (ReadyProbe, CLAUDE.md lesson); not changed |
| JOURNEY-3 | — | ending cinematic | result hidden during cinematic | not a bug: CinematicOverlay clears after SHOT_SECONDS (QA waited 4 s of 14) |
| JOURNEY-4 | Low | console | three.js deprecation warnings, one unexplained 404 | blending warning fixed (2d35967); THREE.Clock deprecation is inside @react-three/fiber; 404 not reproducible (full lobby→game run, zero ≥400 responses) |
| JOURNEY-5 | Low | Home | empty-callsign error far from input | **fixed**: errors render inside the form that raised them (lead-verified /tmp/btw-shots/lead/home-err-create.png) |
| JOURNEY-6 | Low | Home join | join-by-code asks callsign again | by design: Join page shows who is aboard before asking; same page a shared link opens. Left for student |
| CINE-0 | Medium | Cinematic.tsx | survived shot: ship sidelights read green-left/red-right from astern view — verify port red / starboard green | **fixed** d1effcf (arc-limited sidelights; lead-verified ending-lost-1.5s/5.5s) |
| ENG-1 | Medium | Switchboard.tsx | lit glyph/LOAD plates bloomed to white | fixed (merged ed6836d, lead-verified render) |
| ENG-2 | Medium | Incident.tsx smoke plate | text overran plate | fixed (merged) |
| ENG-3 | Low | Dressing.tsx | ESCAPE TRUNK sign clipped by ladder | fixed (merged) |
| ENG-4 | Medium | engine room | DOOR RAM PRESSURE plate cut by post; ceiling lamp blowout; manifold gauge white-out | **fixed** (engine round 2 + lead: plate moved above gauge, lead-verified /tmp/btw-shots/lead/pump) |
| BRIDGE-4 | Medium | Dressing.tsx telegraph | crushed labels | fixed 1169447 (lead-verified) |
| BRIDGE-5 | Medium | barometer | floating + square halo, looked like a control (inv. 9) | fixed: wall-mounted dial, alphaTest |
| BRIDGE-6 | Low | Decor.tsx | abandon-ship sign far from panel | fixed: above panel (lead-verified) |
| BRIDGE-7 | Medium | EscapePanel | lever knob over label | fixed (lead-verified) |
| BRIDGE-8 | — | Bridge CASCADE/emergency/fire/comms close-ups | audited by lead: davits guard grey square → fixed d4a275c (render /tmp/btw-shots/lead/davits); fire book, evac panel, CASCADE overview OK; EMERGENCY BUS plate 'occlusion' was the act-card overlay (clean in engine/final) | **fixed** |
| CINE-1 | Medium | cinematic | survived 5.8s flat wall framing; dawn glint blotchy; lost-ending 4.7s mount gap; boxy superstructure close-ups | cinematic round 2 |
