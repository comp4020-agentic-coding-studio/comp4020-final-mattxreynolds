# Process overview

## From the brief to Dead Air

Dead Air began with a choice between an asymmetric co-op game inspired by
*Keep Talking and Nobody Explodes* and *Spaceteam*, and a party board game with
simultaneous trivia. I chose the co-op game. Its multi-user behaviour is part
of the game: two seats hold different information and must talk. A throwaway
static prototype fixed the appearance before the server build. The definition
of good remains communication, a quick start, fairness and a station that
remembers its crews.

During C8, three batches of questions directed Claude Code. I chose React,
Vite and Express over the recommended vanilla-JS port because this is the
stack I can explain and extend. I requested both private room codes and solo
seat switching. Random devices, a general-rule manual, editable anonymous
callsigns and new missions in the same room came from those answers. The dev
server ran from the first minute
([`4a59ac1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/4a59ac1)),
and commits recorded working steps. Persistence made randomisation necessary:
a fixed replayable device would reward memorisation instead of conversation.

## Stack and constraints

React gives the five modules and two seats a component structure. Express
serves the API and built Vite client from one process; Node 24 runs TypeScript
with type stripping. SQLite uses the existing Fly volume rather than requiring
a separate database service. These choices fit the course's single small
machine, but synchronous writes and in-process streams constrain scaling.

SSE carries server-to-client snapshots; ordinary POSTs carry actions. WebSockets
would add a second protocol without solving the gameplay decision. SQLite
stores devices, deadlines, strikes and mission history. Manual text and rule
logic live together in `shared/game.ts`
([`2c02f96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/2c02f96)).
Server authority and role-filtered views preserve the information split.
Seats remain switchable views, not exclusive ownership or adversarial security.

## Directing C9

For C9 I instructed Codex to audit the actual application, make one defensible
multi-user decision, improve the backpressure and finish with a reviewable PR.
The instruction explicitly preserved the definition of good and rejected a
superficial transport replacement. The agent read the live
[C9 brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/)
and [final project contract](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/),
then the project material, architecture, specs and C8 history. It confirmed a
clean tree, updated `main` and branched from `2aab958`.

The starting assumption in the old process overview was that SSE already
covered real-time. Investigation separated transport from semantics. All 21
baseline tests passed, yet a concurrent double flip restored the original
switch position. An out-of-range integer action returned an error after
starting the clock in memory without saving or broadcasting it. The existing
malformed-action check covered a string, missing that boundary. Independent
desktop/mobile browser contexts reproduced a third gap: after going offline,
the Expert still saw “LINK: LIVE”. Inspection also found ten-second station-log
polling and HTTP responses able to replace newer stream state.

The [audit](docs/evidence/c9-audit.md) records these findings. Failing checks
and the decision were committed before implementation
([`6dde07c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/6dde07c)).

## The multi-user decision

[ADR 0001](docs/adr/0001-observed-state-actions.md) considers accepting every
arrival, reserving the Operator seat, merging by module, and requiring the
observed mission/revision. The last option was chosen because a key pressed on
an unseen stage is not a communication mistake. First valid arrival wins;
stale commands are refused without strikes and require another read-back.
Presence changes do not invalidate an instruction.

The cost is rejecting simultaneous actions even on unrelated modules.
Exclusive ownership would need takeover rules and disrupt solo switching;
module merging would add dependencies around strikes, override and reset.
No option promises fairness by player identity. Lost acknowledgements are
resolved by reading the recovered device, not automatically retrying commands.
This is a deliberate small-game policy for one server, not distributed merging.

## Implementation and corrections

Revision checks, field bounds and transactional state/end-log writes landed
in [`6720569`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/6720569).
Rejected actions use a discarded copy, preventing hidden mutations. Deadline
expiry is checked at access as well as by the timer. Existing C8 rooms begin
at revision zero without replacing their devices.

Next, SSE became the client's sole source of room views. Controls pause on
link loss and while submitting; reconnect restores a full snapshot, including
an ended mission. Acknowledgements cannot roll back newer events. Stream
cleanup removes empty room sets and heartbeats; queued writes are bounded.
Late joiners are saved into the mission crew. Open station logs now stream
personalised updates
([`3490a29`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/3490a29)).

Screenshot review then found that the recovery warning sat below the long
Expert manual on a phone. It moved above the timer with a viewport assertion
([`3922f38`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/3922f38)).
One verification rerun used stale asset references after rebuilding while the
production server retained its old index. Restarting after build corrected
the setup; the clean browser run passed. This operational lesson also went
into CLAUDE.md.

A final lost-acknowledgement probe then failed: the server had applied and
streamed an action, but its hanging HTTP response left controls disabled.
Bounding the wait to five seconds reports uncertainty and releases pending
controls without replaying the command. Its browser check first failed, then
passed after the correction; the harness now requires bounded waits.
Independent specification review caught body-read timeouts being swallowed by
the API helper. A real HTTP response with a stalled body reproduced it; the
helper now preserves the abort and that regression check passes.

## Backpressure and limits

The final `pnpm check` passed 45 checks, including the original game rules,
2000 generated-device checks and privacy checks. New HTTP/SSE specs cover
same-snapshot races, duplicate keypad input, old missions, filtered conflicts,
room isolation, every listener, presence and live station logs. Browser tests
use separate storage contexts, real buttons, desktop/narrow layouts, offline
recovery, leave/rejoin, and a real HTTP response delayed behind newer SSE.
Restart tests use independent processes and disposable SQLite: device,
revision, deadline and late crew survive; downtime expiry logs once.

A separate UI review completed all five modules without a strike. Giving the
Expert browser a 45-second clock skew still produced matching countdowns.
Screenshots were inspected and console-error lists were empty. These are
agent-run checks, not a human pod trial or proof every network meets one
second. The judged claims still need first-time pairs at the crit.

CLAUDE.md now records server authority, information separation, observed-state
commands, persistence before broadcast and independent-session verification.
The reflection is an evidence-based draft for my review. Deployment remains
unchanged: this public repo's CI checks and deploys `main` after merge; the
branch itself has only been verified locally in production mode.
