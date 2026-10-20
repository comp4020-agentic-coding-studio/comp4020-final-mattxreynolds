# Operating Dead Air from its instruments

## Identity and permissions

A person is an anonymous browser profile. The server issues a random 128-bit
bearer id, kept in local storage, and derives a public ten-hex-character tag.
Separate Chrome profiles/incognito storage get separate identities. Reloads
retain identity; clearing storage or changing browsers creates a new person.
Callsigns are editable labels and may collide; `actorTag` is the stable log
key. The browser tag is visible in the lobby and crew list. Use fictional
callsigns, because they appear publicly and in operational logs.

The server checks the stored bearer id for room creation, all commands,
renaming and streams. A rename updates only the authenticated player; a body
claiming someone else's id/tag is ignored. Public room snapshots and station
history are readable without identity. A room code is an invitation, not a
security boundary: anyone with it may join and select either seat. Room codes
have four characters and are unsuitable for sensitive data.

The requested seat determines the server's projection on GET, SSE and command
responses: Expert omits all device data; Operator receives the device. Expert
may Begin and load the next mission, but device inputs return 403 without a
revision change or strike. A player can deliberately switch to Operator;
there are no exclusive seats or secret role grants. This preserves solo play
and quick teammate takeover. Other players' names and history cannot be
edited through these permissions. Mission history is immutable; a rename
updates open presence/live crew, leaving completed crews as played.

## Event contract

One JSON object per stdout line, `schema: 1`, UTC `at`, `level` and `event`.
Node/framework infrastructure messages may surround these application lines.
HTTP work has a server-generated `requestId`, also returned as `x-request-id`.
Ignore client-supplied correlation ids. Identity is resolved from the database,
never copied from an alleged actor in a command body.

| Event | Read it as |
| --- | --- |
| `player.created`, `player.renamed` | Stable `actorTag`, current label (and previous label on rename) |
| `room.created` | Which player opened which room and mission |
| `room.connected`, `room.disconnected` | Tag, seat, unique `streamId`, room/mission/revision and connection count; repeated connects are snapshots/reconnects, not extra people |
| `station.connected`, `station.disconnected` | A browser entered/left the live station history |
| `action.resolved` | Who submitted which input; accepted, strike, conflict or rejected, with HTTP status and reason |
| `mission.finished` | Committed outcome/progress and participating public tags; null actor and `cause: deadline` for expiry |
| `request.completed`, `request.failed` | Method, route template, status/duration; safe failure kind and correlation id |
| `stream.slow` | Queued bytes exceeded 64 KiB; stream closes so the browser can recover |
| `server.started` | Process listening, mode and port |

`room`, `mission` and `revision` order committed actions across several crews.
Accepted inputs include the previous revision/mission, current progress,
strikes, solved module names and deadline. `position` is **zero based**, matching
the command: add one when narrating wire/key/symbol/switch position. A flip
includes its resulting `switchUp`; symbol/keypad progress reveals resets.
Conflicts include the observed revision and current one, with no mutation.
A game mistake is an HTTP 200 with `result: strike`, not a server failure.
Malformed commands expose only a recognised action name or `unknown`.

Events report committed changes after SQLite commit. They are operational
observations, not an event-sourced database or a transactionally durable audit
ledger: a process crash immediately after commit can lose its stdout line.
SQLite remains the recovery source. Fly retains logs for a limited period;
code instrumentation remains after the crit, while important rehearsal
summaries are recorded in `docs/evidence/`. Avoid treating the terminal tail as
permanent storage or evidence that a disconnected person is still listening.

## Live rehearsal

```sh
mise exec -- flyctl logs -a comp4020-final-mattxreynolds
```

Start this **before** giving two people only the public URL. Both open separate
Chrome profiles. All join instructions, callsigns, codes and seat controls are
on the page. Narrate from the terminal without opening the UI:

1. Identify each `player.created`/`station.connected` by callsign **and tag**.
2. Follow room creation and both seat connects; ask them to confirm which tag
   is theirs if their callsigns match. A seat switch closes one stream and
   opens another for the same tag.
3. Follow Begin, inputs and progress. Describe strikes separately from stale
   conflicts. A new revision with `switchUp` is enough to narrate a flip.
4. Ask one browser to reload: the same tag reconnects at the current revision
   and deadline. Observe completion, station publication and a fresh mission.
5. Stop at any discrepancy; correlate HTTP failure ids with the safe server
   event. Do not enable raw access logging to debug an SSE URL.

Raw tailing is sufficient for this small game. Optional local filtering of Fly
JSON envelopes (requires jq, omitted from the normal workflow):

```sh
mise exec -- flyctl logs --json -a comp4020-final-mattxreynolds |
  jq -R 'fromjson? | .message | fromjson? | select(.schema == 1)'
```

Filter the parsed objects by `room` or `actorTag` when several crews play.
Do not filter out rejections or deadlines when explaining a mission.

## Privacy and verification

Application logging allowlists fields. It excludes bearer ids, headers,
queries/full URLs, IPs, user agents, raw request/error payloads, stacks and
complete devices/answers. Parser and unexpected-error responses are safe JSON;
they return correlation ids without reflecting offending data. Bearer ids in
native EventSource queries are necessary for this existing transport; keep
raw URL/access logging disabled. API use is same-origin over Fly HTTPS.

`spec/telemetry.test.ts` captures real server stdout and checks events,
correlation and sentinel-secret absence. `spec/identity.test.ts` checks view
permissions, rename ownership and live identity consistency. The other HTTP,
SSE, browser and restart checks retain C9's concurrency/recovery contract.
Use disposable local storage for the full suite; it creates many test crews
and finished runs. The focused production rehearsal should use fictional
callsigns and only a few rooms, then inspect the actual Fly tail.
