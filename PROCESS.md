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

## [STUDENT REVIEW] Your reflection

What you decided, what surprised you, and what you would do differently.
The agent cannot write this for you.
