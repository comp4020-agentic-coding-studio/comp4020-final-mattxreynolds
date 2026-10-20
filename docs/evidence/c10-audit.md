# C10 audit and working plan — 20 October 2026

Starting point: clean `main`, `d3eb1dd`, fetched and fast-forward checked against
origin. The separate exploration at `0f632df52c58ccd1112e799894263a363389f150`
was copied locally and remotely to `exploration/escape-room`, verified using
`ls-remote`, then the old local/remote C10 refs retired. No exploration commits
were imported. Submission branch: `c10/fly-by-instruments`.

Read the live [C10 contract](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/),
repository instructions, C8/C9 history, README, PROCESS, reflections, ADR 0001,
server, shared rules/views, client, tests, CI and Fly configuration.

## Contract and implementation direction

The fixed contract requires distinct browser users acting on shared state,
server-checked and documented visibility/change rights, durable instrumentation
in the application, a deployed URL-only two-profile demonstration narrated
solely from logs, growing commits, PROCESS and the two-prompt C10 reflection.
Actual pod participation and personal reflection cannot be manufactured by an
agent. Prepare the rehearsal and leave those judgements explicit.

Keep Dead Air, anonymous browser bearer identities, public tags and switchable
seats. No accounts or dashboard. JSON stdout plus Fly's live log tail is enough
if it reports joins, seat changes, every input, strikes, lifecycle, conflicts,
invalid requests and server failures with safe correlation fields.

Audit findings: only a prose startup line currently reaches stdout; in-page
mission notes omit intermediate symbol and switch actions. Callsigns can
collide and change, so the public tag must be the primary actor identity.
Streams cache Player objects, allowing a renamed player to appear under an old
callsign and overwrite crew attribution. Expert projections are filtered on the
server, but Expert requests can currently send device actions. Seats remain
voluntary views, so checking the requested seat is an interface permission,
not protection against someone deliberately selecting Operator. Error defaults
can expose Express HTML/stack output and lack safe diagnostic correlation.

## Planned increments

1. Establish baseline and record audit/permission/log design.
2. Add structured server events and request/error correlation; assert complete
   multi-user log stories and absence of credentials/raw payloads.
3. Repair permission and stale identity behaviour with regression checks;
   exercise races, reconnects, desktop/mobile clients and production build.
4. Deploy using the existing single-machine Fly conventions; rehearse with
   separate browser contexts and inspect actual production logs.
5. Update user/operational docs, process, reflection and justified harness
   lessons; independently review against main and the live contract, rerun
   checks, push and open the PR with green CI. Never merge it.

Evidence below will distinguish completed checks from plans and human-only work.

## Baseline and structured logging increment

Locked dependencies initially reflected the other branch's stack in the local
`node_modules`; reinstalling the unchanged lockfile restored Express/React.
The post-C9 production build and all 45 existing checks passed before changes.
The new isolated logging checks pass alongside restart checks (4 tests):
colliding callsigns remain distinct by public tag; simultaneous flips yield
one accepted revision and one logged conflict; malformed/unknown identities,
rename, disconnect/reconnect, strikes and committed mission end are readable.
Parser, oversized-body and unexpected errors return a safe correlation id.
Captured stdout is asserted free of player credentials and sentinel payloads.

## Identity/permission probes and correction

With the instrumentation increment deployed locally, both new identity probes
failed: Expert flip returned 200 instead of 403; a renamed player never
appeared under the new name in an already-open teammate stream. The fix
permits Expert lifecycle commands and refuses device commands at the server
boundary. Rename notifications refresh active stream objects and persist live
crew labels before broadcast, without advancing the gameplay revision.
Completed mission names remain historical. Lobby/crew now show public tags so
identical callsigns can be distinguished on the page as well as in logs.

The corrected production-style suite passed typecheck and **55 tests in 11
files**. This includes all six Expert device-input checks, rename spoofing
(body-supplied other-player ids are ignored), live presence and finished crew,
and a forced SQLite trigger failure. The latter returns safe HTTP 500 while
leaving revision/strikes/status unchanged and emitting no accepted-action or
mission-end event. Removing the trigger allows the next command to succeed.
This is a verification fault injection in disposable storage, not a reported
production outage. Screenshot review covered desktop and 390px Operator,
Expert and recovery layouts, with no horizontal overflow or console errors.
