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

## Rehearsal exposed bootstrap recovery

The first focused local rehearsal stalled waiting for a station-history tab
opened just before taking its browser offline. That setup did not wait for
identity/stream readiness. Inspection exposed a real adjacent fault:
`ensurePlayer` treated every lookup failure as a missing identity, registering
again on a temporary 503 and providing no retry if registration also failed.
A browser probe against the old build timed out waiting for recovery UI.
The correction replaces identity only on HTTP 404, bounds bootstrap requests,
keeps storage on transient failure and offers Retry plus online recovery.
The rehearsal now explicitly waits for station readiness before offline work.

The corrected focused local rehearsal completed one exploded and one fully
secured mission with two independent desktop/mobile profiles, both crew tags,
same-tag/deadline recovery and 400/401/403/409 probes. No browser console/page
errors or horizontal overflow. This is scripted agent verification; it does
not stand in for two human pod members playing from the URL at the crit.

## Independent review and genuine corrections

The code-review skill ran separate Standards and Spec reviews against
`main...259f87c`. Standards found that a departed participant's rename did not
update their still-live mission crew; Spec found that unexpected command
failures retained a request id but lost actor/room/action attribution. New
probes reproduced both failures before correction. Rename now follows live
participation independently of connection presence. Allowlisted request
activity context survives into safe failure events, including a bounded Node
error code but no exception message. Deadline timers explicitly escape the
arming request's context, so later system expiry cannot inherit that player.
Both reviewers rechecked the corrections and reported no remaining actionable
findings. Standards independently reran all three telemetry checks successfully.
The full suite passed **57 checks**, including the detached-rename regression.

The first Fly deployment (source `259f87c`) built the unchanged Dockerfile and
updated the existing machine successfully. Public health returned 200 and
real production stdout contained `server.started`. Its JSON CLI envelopes are
pretty-printed, not JSONL; the guide's optional jq parser was corrected against
actual output. The final code deployment and two-profile log rehearsal follow.

## Final production verification

Final runtime source: `151e12281a4b0c2f5d32696f5174b90fc239f916`.
`flyctl deploy --remote-only --ha=false` built the existing Dockerfile and
updated the existing `syd` machine `e82de00b4e2678` (version 7), preserving its
volume. Image: `deployment-01M5BR021RDKPN95RFHD8FW6Q6`, 69 MB. Fly smoke/machine
checks and DNS verification passed. This branch was deliberately deployed
**before merge** under the user's instruction; merging later runs normal CI.
Subsequent evidence/script edits do not change the deployed runtime or README.

At 2026-10-20 04:10 UTC (15:10 Sydney), ran the focused rehearsal against
<https://comp4020-final-mattxreynolds.fly.dev> with independent Chromium contexts
at 1440×900 and 390×844. Both arrived from the URL, renamed through the UI,
opened/joined room **ZZ3R** and chose seats. C10-ALPHA tag `bb1d10dc9a` and
C10-BRAVO tag `e61b6ebc20` are separate browser identities. Expert Begin and new
mission controls, Operator module inputs, real racing Operator buttons,
reload/offline recovery and an open station-history tab all worked.

- Simultaneous same-snapshot input: **200 + 409**, one revision, zero strikes.
- Explicit stale snapshot **409**, Expert device **403** (no device in reply),
  malformed input **400**, unknown identity **401**; no unintended mutation.
- Reload retained BRAVO's tag and the original deadline. Offline UI paused
  controls; reconnect recovered the ended mission and updated station history.
- Mission 1 ended on three intentional locked-override strikes. Mission 2
  completed all five modules through real UI controls with **zero strikes**.
  Both mission records contain both tags. Browser page/console errors: **none**.
- Desktop/narrow screenshots were inspected, including visible recovery above
  the manual, crew tags and final progress. No horizontal overflow. Retained
  [mobile crew](c10-mobile-crew.png) and [recovery](c10-mobile-reconnecting.png)
  screenshots show this production room, not a mockup.
- Production HTTP smoke: `APP_URL=<public URL> pnpm exec vitest run
  spec/invariants.test.ts spec/docs.test.ts`: **7/7 pass**, including public
  README headings and repository-doc exclusions. Health returned `{ok:true}`.

The separate `flyctl logs --json` stream was captured while the browsers acted.
Parsed actual application messages matched **85 relevant events**, including
28 action resolutions, all **23 consecutive committed revisions**, both tags,
six seat/reconnect snapshots, five rejected/conflicting actions and both
committed mission outcomes. Assertions checked exact outcomes, participation,
revision continuity, every action kind and all four rejection reasons.
A privacy scan of these events found no 32-hex bearer credentials, raw URLs,
headers, bodies, devices, stacks or the supplied invalid credential sentinel.
No error-level events appeared in this rehearsal. Unexpected failures are
verified safely in the isolated fault-injection suite, not by damaging production.

Retained [public summary](c10-production-summary.json) and
[unmodified event selection](c10-production-events.jsonl) allow review without
access to the transient Fly tail. The selection includes every room connection
and both outcomes, plus representative input/result combinations; it is not a
complete event archive. Raw infrastructure messages and temporary captures
remain outside Git. Live terminal narration needs no UI or bespoke dashboard.

## Final contract audit

Re-read the live C10 spec after deployment; it still has six fixed items.

| Requirement | Concrete evidence / honest boundary |
| --- | --- |
| Deployed distinct people on shared state | Public two-context rehearsal, summary, matching tags/events |
| Server visibility/change policy, documented with reasons | Expert projections and permissions, own-identity rename; identity tests and operations guide explain voluntary seats |
| Persistent server instrumentation identifying actions | Versioned stdout events in runtime, actual Fly sample, safe-error/fault tests; no crit-only switch |
| Two pod members at crit, URL only, narration from logs | On-page joining and terminal workflow rehearsed; **actual human crit remains to be performed**, cannot be supplied by an agent |
| Growing commits, PROCESS and crit-10 reflection | Audit, logging, identity, recovery, documentation and review-correction commits; rewritten overview and two-prompt reflection |
| Account of agent grounding/direction/corrections | User direction, audit, genuinely failing probes, reviewer findings and fixes recorded here and in PROCESS |

Latest complete production-style local suite after final runtime changes:
**typecheck + 57/57 tests in 11 files**. Build, evidence check and whitespace
check pass. No lint script exists. Local browser propagation measured 19 ms to
Expert and 5 ms to station history in the earlier screenshot run; these are
local observations, not production latency guarantees. The full disruptive
suite uses disposable local SQLite; only the focused rehearsal and seven
read-only smoke checks ran against production.
