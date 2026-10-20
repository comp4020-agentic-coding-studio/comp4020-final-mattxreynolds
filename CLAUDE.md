## Dead Air invariants

- The server owns devices, rules, strikes, mission lifecycle and deadlines.
  Clients send intents; validate command shape and bounds before mutating.
- Expert projections omit device data on GET, SSE and error responses. Keep
  player secret ids out of views and station logs. Seats are switchable views,
  not authentication or exclusive ownership.
- Browser identity is replaced only after a confirmed missing-player response;
  temporary failures preserve storage and expose bounded recovery.
- When changing identity or logging, read `docs/observability.md`. Log selected
  public tags and validated action/progress fields after commit; credentials,
  URLs/queries, request bodies and raw errors stay outside the sink. Verify
  actual stdout and, after deploying, correlate two independent profiles with
  the Fly log tail. Matching callsigns must still be distinguishable.
- Keep manual text and executable rules aligned in `shared/game.ts`; preserve
  randomised solvable devices and the information split that makes talking necessary.
- Before changing multiplayer, read `docs/adr/0001-observed-state-actions.md`.
  Every command carries its observed mission and room revision. First valid
  arrival wins; stale/repeated commands are refused without a strike or retry.
  Presence changes leave the gameplay revision alone.
- Persist accepted changes before broadcast. Mission state and its finished
  station-log entry commit together. Recovery preserves revision, device and
  deadline; the clock runs while disconnected and across server restarts.
- SSE snapshots own client room state. HTTP acknowledgements cannot overwrite
  newer stream state. Hide the previous seat's projection immediately on a
  role change; pause controls until connected to a fresh snapshot. Bound
  acknowledgement waits and report uncertain outcomes without replaying intents.
- Keep broadcasts scoped to their room; only station-log updates are global.
  Clean up stream listeners/heartbeats and bound queued writes for slow clients.
- When changing multiplayer, run the existing HTTP, browser and persistence
  specs against a running app. Use independent browser contexts with separate
  storage, including desktop and narrow viewports. Inspect screenshots as well
  as assertions; recovery feedback must be visible above the long manual.
- For production UI verification, build and then restart the server: it reads
  its asset index at startup. Install Chromium with `pnpm exec playwright
  install chromium` before browser checks (`--with-deps` in a fresh Linux CI).

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues. Before tracker operations, read
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before triaging, read
`docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Before codebase exploration, read `docs/agents/domain.md`.
