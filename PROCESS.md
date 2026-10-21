# Process

> **How to read this file.** It was written *during* development by the lead
> coding agent (Claude Code, Opus 5.5) as a factual log. Entries marked
> **Verified** describe things that happened in this repository and link to
> the commits. Entries marked **Rationale** explain why. Sections marked
> **[STUDENT REVIEW]** need your own account and judgement. Nothing here
> describes user testing, because none has been recorded yet.
>
> Commit links point at `github.com/mattxreynolds/below-the-waterline`, which
> doesn't exist yet. The hashes are real and resolve in this repository
> (`pnpm check:evidence` verifies that). **[STUDENT REVIEW]** Update the URL
> prefix once you choose the remote.

## Starting point

**Verified.** The working directory `final-prototype/` was empty. The course
had already provisioned a separate repo (`comp4020-final-mattxreynolds`) with
an earlier, different ship-themed escape room (Svelte + Hono, about 74 merged
PRs). That repo was left untouched. The course starter template was taken
from that repo's initial commit (by the convenor) and committed here
unchanged as the first commit,
[`e13044b`](https://github.com/mattxreynolds/below-the-waterline/commit/e13044b).
That way the supplied harness survives intact: `spec/invariants.test.ts`,
`scripts/check-evidence.ts`, the Dockerfile/`fly.toml` shape, CI and the
pre-commit hook.

**Rationale.** The brief said to preserve starter constraints and not
blindly replace starter files. Rebuilding the existing provisioned repo would
have overwritten a large body of earlier work without being asked to.

[STUDENT REVIEW: say which repo you intend to submit from. If it is the
provisioned course repo, this history needs to be brought across, by pushing
this repo there as a branch or by changing the remote.]

## Brief → documents → interfaces

**Verified.** Before any game code, the design was written down in
[`f73b184`](https://github.com/mattxreynolds/below-the-waterline/commit/f73b184):
`docs/PRODUCT.md`, `GAME_DESIGN.md`, `PUZZLES.md` (each phase's split of
information and controls between the two roles, plus validation rules),
`ARCHITECTURE.md`, `MULTIPLAYER.md`, `VISUAL_DIRECTION.md`, `DEPLOYMENT.md`,
four ADRs, and `CLAUDE.md` as the engineering constitution.

**Rationale.** A long agentic session loses context. The documents are the
recovery point, and they let parallel subagents work against fixed
interfaces.

## Vertical slice before delegation

**Verified.** The lead agent built the foundation alone in
[`cb41ac9`](https://github.com/mattxreynolds/below-the-waterline/commit/cb41ac9):

- shared protocol types
- the pure voyage reducer, with guarded once-only transitions
- the per-role view projection
- SQLite persistence
- create/join/reconnect
- the lobby
- the first-person controller and `Interactable` system
- greybox rooms with the one prologue cross-room action

It was tested with socket-level specs and a Playwright walkthrough in two
independent browser contexts (16 tests passing at that commit).

Problems found while building it:

- **Redirect loop on `/readme/`.** Express 5's loose trailing-slash matching
  made `app.get("/readme")` also match `/readme/`, so the page redirected
  to itself. Caught by a curl smoke test. Fixed by redirecting only when
  `req.path` is exactly `/readme`.
- **Balance.** A worked estimate showed the first danger rates would end a
  careful 12-minute voyage at about 98/100, which is near-certain loss. The
  rates were lowered and the estimate written into `docs/GAME_DESIGN.md`
  ([`72c4e02`](https://github.com/mattxreynolds/below-the-waterline/commit/72c4e02)).
  The STABLE/RISING threshold was lowered at the same time, so that a slowly
  rising ship never displays "STABLE".
- **A unit test that plays a whole voyage** through the reducer for several
  seeds was written *before* the 3D work was delegated. It proved that every
  phase in `PUZZLES.md` is solvable as specified.

## Delegation

**Verified.** Once the interfaces were fixed, three workstreams ran in
parallel in separate git worktrees, each with disjoint file ownership:

| Workstream | Model / effort | Owned | Forbidden |
|---|---|---|---|
| Engine Room 3D | Opus 5.5 / medium | `client/scene/EngineRoom.tsx`, `client/scene/engine/` | shared/, server/, spec/, protocol |
| Bridge 3D | Opus 5.5 / medium | `client/scene/Bridge.tsx`, `client/scene/bridge/` | same |
| Reliability tests | Opus 5.5 / medium | `spec/` (except the course's files) | protocol, schema |

Before delegating, the lead added an interactable id contract
(`client/scene/ids.ts`), a shared palette, a shared glyph renderer (so both
rooms draw identical shapes), and `scripts/screenshot.ts`. The screenshot
script lets an agent jump to any phase and look at both rooms.

(Integration results are recorded below as they happen.)

### Reliability workstream (merged in [`75740cc`](https://github.com/mattxreynolds/below-the-waterline/commit/75740cc))

**Verified.** The agent added 8 spec files. They cover persistence across
SIGTERM and SIGKILL restarts, view secrecy for every phase, server
authority and races, presence and pause, replay, server-rendered pages, and
slow or dropped links in two browser contexts. 84 tests passed, run three
times in a row. I reviewed both of its server changes before merging:

- **A real crash bug**, [`ebbebb3`](https://github.com/mattxreynolds/below-the-waterline/commit/ebbebb3).
  `applyIntent` looked up `INTENT_RULES[intent.t]` without checking it was an
  own key. A seated client sending `{t: "toString"}` made the reducer throw
  inside the socket handler, which killed the process and every live
  voyage. The adversarial authority spec found it. It is now fixed with
  `Object.hasOwn`, and a unit regression test covers it.
- [`42c964d`](https://github.com/mattxreynolds/below-the-waterline/commit/42c964d):
  `res.sendFile` refused paths containing a dot-directory, so `/` returned 404
  when the repo was checked out under `.claude/worktrees/`. Production was
  never affected.
- **A testing lesson.** Chrome's CDP latency emulation does not delay frames
  on an open WebSocket. A "slow connection" test built on it alone would
  have passed while testing nothing. The agent measured this and proxied
  socket frames with an added delay instead.

### Room workstreams (Engine Room [`69dcb7f`](https://github.com/mattxreynolds/below-the-waterline/commit/69dcb7f), Bridge [`cef6869`](https://github.com/mattxreynolds/below-the-waterline/commit/cef6869))

**Verified.** Both agents kept strictly to their own folders; I checked
this with `git diff --name-only` before each merge. Neither needed a
protocol change. I re-screenshotted every phase from the merged `main`
myself, rather than trusting the agents' screenshots. Both agents reported
the same two script bugs: the screenshot `--views` separator clashed with
commas inside poses, and worktree paths broke static serving (already fixed
by the testing merge). I fixed the separator after merging.

### Integration failures and what they revealed ([`f1574b4`](https://github.com/mattxreynolds/below-the-waterline/commit/f1574b4))

With both rooms merged, the whole-voyage browser spec ran for the first time
and failed in two places. Both failures were real findings, not test noise:

1. **The flood pump hand-off was too punishing.** The spec handed a pump to
   the third compartment the moment the first two read under 20%, and the
   first crept back over the line while the third drained. The arithmetic
   (drain ≈ 15 s, creep ≈ 6.6 points) showed a crew must drain well below
   the target first, so the spec now does what a crew must do. Inflow was
   also lowered (0.25–0.45 → 0.15–0.30 per second) so the hand-off is
   learnable.
2. **A 1.5–3 s main-thread stall on first entry.** The strict 1.5 s
   cross-room browser check failed intermittently. In-page timing showed the
   network delivered the view in under 100 ms, but each room's first mount
   froze the page for about 1.5 s while shaders compiled (SwiftShader). A
   lever pulled in that window reached the other screen 2.3–3 s later. I
   did not loosen the timeout. The briefing card now shows "Lighting the
   lamps…" until frames flow, with a 6 s cap. A first version, which needed
   20 frames under 250 ms, never became ready under software rendering. That
   would have stranded slow laptops, so it was relaxed to 8 frames under
   0.5 s.

After this, all 85 tests passed three runs in a row. That includes the full
voyage played through the real controls in two independent browser contexts
(Prologue → Power, including a deliberate short circuit → Flood → Radio →
Escape → Survived → Ship's Log → Sail again).

### Polish and review workstream ([`a2f136a`](https://github.com/mattxreynolds/below-the-waterline/commit/a2f136a)…[`0a30042`](https://github.com/mattxreynolds/below-the-waterline/commit/0a30042))

**Verified.** The fourth delegated agent (Opus 5.5, medium) found and fixed
five client bugs:

- **Fast double-presses were silently dropped.** A toggle computed its next
  value from the last 200 ms view, so the second press did nothing.
- **Controls could be used while hidden.** Raycasting ignores visibility,
  so stations still compiling their shaders could be aimed at and used.
- **"Sail again" connected twice**, rebuilding the 3D canvas twice.
- **The whole scene re-rendered on every view**, five times a second.
- **Pointer-lock rejections were unhandled.**

It also added a per-phase "where to look" banner and pulse-lamp beeps
synced to the lamp's own timing, plus sounds for remote pump changes. I
checked its wording for spoilers and glyph names before accepting it.

### Marker simulation

**Verified.** I scripted a walkthrough as a stranger, in two independent
profiles: `/readme/` → Play → a hostile callsign (rejected) → create → join
by typed code → a bad code → a third player → ready → prologue → a breaker
(it was the shorted one: trip, one mistake recorded) → **SIGTERM the
server mid-voyage, restart it** → both clients restored with identical
state → refresh → `/history/` lists the live voyage. One fix came out of it:
a mistyped code logged a 404 in the console.

Running `pnpm check` the way CI does (production app, no test hooks)
exposed a real latency problem, fixed in [`8ef9d01`](https://github.com/mattxreynolds/below-the-waterline/commit/8ef9d01). A silent network drop went
unnoticed for up to 25 s because of the Socket.IO heartbeat defaults. During
that time the ship kept flooding instead of "holding". It is now about 13 s.

### Can one seat solve it alone? (the most important finding)

**Verified.** A flaky authority test kept failing for one seed. Tracing it
showed that ~5% of generated power puzzles had the answer "breakers 1, 2, 3",
so sweeping left to right solved Power with no talking ([`fa26f8f`](https://github.com/mattxreynolds/below-the-waterline/commit/fa26f8f)). That
prompted a systematic audit. Every puzzle was simulated against a
**no-communication strategy** before changing anything. **Every one of the
four was solvable blind:**

| Puzzle | Blind strategy | Before | Fix | After |
|---|---|---|---|---|
| Power | Engineer sweeps combinations using the load meter | ~1.6 trips per solve | rating moved to the Bridge; wrong pairings trip ([`591de31`](https://github.com/mattxreynolds/below-the-waterline/commit/591de31)) | ~3 trips, ~9–12 danger (costly, **not** impossible: documented as an honest limit) |
| Flood | open every valve, rotate pumps | 40/40 solved | backflow 1.2 → 3 %/s ([`0102dba`](https://github.com/mattxreynolds/below-the-waterline/commit/0102dba)) | 0/40 blind, 40/40 informed |
| Radio | sweep channels coupling each time, sweep bearings transmitting each time | ~14 danger | arc cost +1 → +2 | ~22 danger |
| Escape | hold release, pump steadily | 60/60 opened | over-pressure slips the rams ([`fbc93ca`](https://github.com/mattxreynolds/below-the-waterline/commit/fbc93ca)) | 0/60 blind, 60/60 talking (13–22 s) |

**Rationale.** The project's definition of good is "moments in which two
people genuinely need one another". The original puzzles *displayed*
asymmetric information but didn't *require* it. Unit tests now lock in that
blind play fails for Flood and Escape. Raising mistake costs then made a
slow-but-steady 14-minute pair lose (≈ 95 danger), so the base rates were
lowered again (now ≈ 76).

[STUDENT REVIEW: this is the clearest example of the agent's tests changing
the design. Consider whether it belongs in your README argument.]

## Second production cycle (one unattended overnight session)

The student gave one long brief asking for fifteen ranked features. Below
is what happened, in order.

### Lead first: server and protocol before delegation

The lead wrote the server side alone before any delegation
([`4dc5c37`](https://github.com/mattxreynolds/below-the-waterline/commit/4dc5c37)). That covered the continuous ship systems (`ship.ts`:
grid, water, hull, Act IV breaches and calls, the accumulator), the new
CASCADE phase, the davits gate on the escape, modes, practice starts from a
seeded scenario, an ordered event log and the debrief builder. The
protocol, secrecy projections and IDs were fixed first so the room work
could proceed in parallel. ADR 005 records why the phase machine was kept
rather than rewritten.

### A blind-play hole the first cycle missed

The first cycle's simulation of blind Flood play used a *fixed* sweep. A new
simulation used a *reactive* blind Engineer: open on deadhead, shut on
backflow. It won 40/40 seeds at no cost, because the gauge reveals which
pumps run. Running-dry seizure and a 6 s hold ([`4dc5c37`](https://github.com/mattxreynolds/below-the-waterline/commit/4dc5c37)) made blind
play cost about 10 more danger than a talking crew, but **did not** make it
fail. PUZZLES.md now records this as an honest limit rather than claiming
otherwise.

### Delegation

Two Opus subagents (medium effort) worked in parallel, each owning one
side's client directory with no shared files. One built the Engineer's Aux
Machinery Room, the other the Bridge's Comms Room. Meanwhile the lead built
the lobby settings, debrief UI, cinematics, audio, docs and the chaos spec
([`b6cdbab`](https://github.com/mattxreynolds/below-the-waterline/commit/b6cdbab), [`6778749`](https://github.com/mattxreynolds/below-the-waterline/commit/6778749), [`867eafc`](https://github.com/mattxreynolds/below-the-waterline/commit/867eafc)). The lead reviewed both
diffs and screenshots and integrated them in [`d6dbae9`](https://github.com/mattxreynolds/below-the-waterline/commit/d6dbae9). The first
full five-act browser run then exposed two debrief bugs (a "clean voyage"
lesson printed despite a trip, and a meaningless escape margin), both fixed
there.

### Balance by simulation, not by people

A scripted crew that plays correctly but waits a human-like thinking time
in each act produced the difficulty table in GAME_DESIGN.md. Danger rates
for Acts III–V were raised a little so a slow first attempt usually dies in
Act V ([`bb0cca1`](https://github.com/mattxreynolds/below-the-waterline/commit/bb0cca1)). **No human playtesting has happened.**

### Hostile-marker audit found a restart bug

An audit script started a fresh server and opened two browser contexts. It
jumped to Act IV, SIGKILLed and restarted the server, then forced a loss.
The open pages never saw the loss: the client drops views with a lower
`rev`, and the server's rev restarted at 0. Fixed by seeding rev from the
clock, with a regression assertion ([`feeb0c4`](https://github.com/mattxreynolds/below-the-waterline/commit/feeb0c4)). The same audit found
unreadable lobby and debrief cards (dark-on-dark).

[STUDENT REVIEW: the overnight session ran without supervision. Decide
whether this section should stay as written, and what you would have
prioritised differently.]

## [STUDENT REVIEW] Your reflection

What you decided, what surprised you, and what you would do differently.
The agent cannot write this for you.
