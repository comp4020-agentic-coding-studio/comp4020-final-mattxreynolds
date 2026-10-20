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
