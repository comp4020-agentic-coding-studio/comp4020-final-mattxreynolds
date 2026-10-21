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

## [STUDENT REVIEW] Your reflection

What you decided, what surprised you, and what you would do differently.
The agent cannot write this for you.
