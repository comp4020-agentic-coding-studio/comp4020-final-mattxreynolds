# Process overview

## From the brief to Dead Air

Dead Air began with a choice between asymmetric co-op inspired by *Keep Talking
and Nobody Explodes* and *Spaceteam*, and simultaneous party trivia. I chose
the co-op game: two seats need different information and must talk. A static
prototype fixed the appearance before the server build. Good still means
communication, a quick start, fair consequences and remembered crews.

During C8, three batches of questions directed Claude Code. I chose React,
Vite and Express over the recommended vanilla-JS port because I could explain
and extend that stack. Private codes, solo seat switching, random devices and
editable anonymous callsigns came from those answers. The dev server ran from
[`4a59ac1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/4a59ac1).
Persistence made randomisation necessary: repeatable fixed answers would turn
history into a record of memorisation. Manual text and executable rules stay
together in `shared/game.ts`.

Sloan's home-cooked app and Shirky's situated software, cited in README, support
a game for a room of classmates rather than an audience-growth product. That
position explains omitting accounts, built-in chat and ranked scores. Whether
the resulting conversation is worthwhile still needs human judgement.

## Stack and agent workflow

React gives modules and seats a component structure. Express serves the API
and Vite client in one Node 24 process; SQLite uses the existing Fly volume.
SSE snapshots plus HTTP intents fit server-authoritative gameplay without a
second bidirectional protocol. Synchronous SQLite and in-process streams fit
one small machine, but scaling requires shared sequencing and pub/sub.

For C9 I directed Codex to audit actual behaviour, choose defensible semantics
and finish a reviewable PR. All 21 baseline checks passed, yet two simultaneous
flips cancelled, invalid integer input secretly started the clock and offline
Expert screens claimed LIVE. The [C9 audit](docs/evidence/c9-audit.md) preserves
those findings. [ADR 0001](docs/adr/0001-observed-state-actions.md) chose observed
mission/revision commands over accepting every arrival, exclusive seats or
module-level merging. First valid arrival wins; stale input needs another
read-back without a strike. The cost is rejecting simultaneous unrelated
inputs too. That is appropriate to a game about deliberate instructions.

C9 added transactional changes, SSE-owned client state, live station history
and restart recovery. Screenshot review moved phone recovery feedback above
the manual. A lost-acknowledgement probe exposed permanently disabled controls;
bounding waits fixed it without replaying commands. Another probe caught body
aborts being swallowed. Those corrections reached tests and CLAUDE.md, rather
than remaining instructions to try harder. C9 finished with 45 checks and
Docker CI; its implementation reached main through PR #20.

## Directing C10

I asked Codex to continue this application through observability, realistic
multi-user checks, production deployment and an unmerged PR. The instruction
explicitly protected the separate escape-room direction. The agent verified
its original commit, copied local/remote refs to `exploration/escape-room`,
verified the remote copy, then retired the old C10 name. Fresh work starts
from current main, `d3eb1dd`, with no exploration commits imported.

The live [C10 contract](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/)
made server permissions and distinguishable people central. The
[audit/plan commit](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/e94d69f)
grounded implementation in C8/C9 history, source, harness, reflections, tests
and deployment conventions. The unchanged baseline passed 45 checks after
reinstalling locked dependencies; local node_modules still held exploration
packages. No dependency changes were needed.

## Instruments and corrections

The existing browser secret/public-tag model was sufficient. Callsigns can
collide and change, so tags identify actors; seats remain voluntary views.
JSON stdout plus Fly's terminal tail serves this small game without a dashboard.
The [logging increment](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/68364bd)
records request correlation, room/mission/revision, inputs, progress, strikes,
conflicts, lifecycle and stream presence. Accepted events follow persistence.
Raw requests, bearer ids, full devices and raw error details remain excluded.
Captured-stdout tests check the story and sentinel-secret absence, including
parser and unexpected failures. The suite grew to 47 passing checks.

Two new probes then failed: Expert input returned 200, and a rename never
reached an already-open teammate stream. The
[identity increment](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/5c985dd)
checks all six device permissions on the server and refreshes active presence
and persisted live crew labels. Historical names remain as played. Public tags
appear on the page. Anyone with a code may deliberately choose Operator;
this supports solo practice and takeover, not adversarial role isolation.
The [operations guide](docs/observability.md) explains that decision and cost.

A forced SQLite failure in disposable storage verifies that failed persistence
neither mutates cached state nor announces success. All 55 checks passed;
desktop/390px screenshots retained the information split and visible warning.
A focused rehearsal then stalled after a station tab was opened immediately
before going offline. Waiting for readiness corrected the scenario, while
inspection exposed a real adjacent fault: bootstrap treated any identity
lookup failure as permission to register again. A failing browser probe
protects the [recovery correction](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/bbd5b84):
only 404 replaces identity; temporary failure keeps storage and offers bounded
retry/online recovery. All 56 checks passed. The corrected two-profile UI
rehearsal completed a lost run and a zero-strike defusal, with explicit
400/401/403/409 probes and no browser errors.

## Evidence and remaining judgement

The [C10 evidence](docs/evidence/c10-audit.md) separates completed checks from
human-only work. Tests include independent browser storage, real buttons,
concurrent inputs, delayed acknowledgements, offline recovery, personalised
history and process restarts. CLAUDE.md now points to logging/privacy rules
and requires preserving identity during temporary failures. README describes
current rights and testable promises; the reflection answers both standing
prompts using the recorded work, without inventing personal reactions.

Independent Standards and Spec reviewers found departed-crew rename and
failed-action attribution gaps. Regression probes reproduced both; fixes now
follow participation independently of presence and preserve safe activity
context on errors. Reviewers rechecked and cleared them. Final local build,
typecheck, all 57 tests and evidence checks passed.

Runtime `151e122` deployed to the existing Fly machine/volume before merge.
The production rehearsal used independent desktop/narrow profiles in room
ZZ3R: racing inputs returned 200/409, recovery preserved tags/deadline, and
400/401/403 probes left state untouched. One intentionally lost mission and a
zero-strike defusal both recorded both tags. Actual Fly logs matched 85 events
and 23 consecutive revisions; a retained selection and summary document that
story. Privacy scanning found no credentials/raw payloads; production browser
errors were empty and seven public HTTP smoke checks passed.
No scripted rehearsal establishes first-time enjoyment, a one-minute human
start, tutor feedback or the required two classmates at the crit. The supplied
URL-only instructions and terminal narration workflow prepare that exercise;
the human event and personal reflection judgement remain for the author.
