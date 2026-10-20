# Crit 10 reflection

*Prepared from repository evidence; personal outlook and the live pod exercise
remain for author review. No classmates' or tutor feedback is claimed.*

## What was the breakthrough that moved the work forward?

The useful breakthrough was treating identity as something the instruments
must preserve through changes. Dead Air already issued browser identities,
but callsigns could collide, streams retained old names after rename, and a
temporary identity lookup failure could register the same browser again.
A log saying only “ALPHA clicked” would hide those distinctions.

Codex was directed to improve the existing game, preserve the escape-room
exploration and verify production. Stable public tags now
connect room entry, seat changes, inputs, conflicts and outcomes without
logging bearer credentials. Server checks refuse Expert device inputs;
switching deliberately to Operator remains allowed for solo practice. That
permission boundary is written down rather than implied by hidden buttons.

Verification corrected the work: new probes first failed on Expert input,
rename propagation and bootstrap recovery. Those findings became server/client
changes and regression checks. Captured stdout and forced storage failure test committed outcomes. The public
two-profile rehearsal then matched both tags and 23 revisions in actual Fly logs.

## What did this work change about who I want to be as a software developer?

The evidence supports a practice I can evaluate: make a promise observable,
then challenge it with independent clients and failures. A dashboard would
have added little while identity could silently change underneath it. The
valuable work was making a small terminal stream explain the game reliably.

An agent cannot establish my personal change of outlook or report the live
crit before it happens. The next human check is two classmates using only the
URL while I narrate from logs, then comparing that account with their actions.
