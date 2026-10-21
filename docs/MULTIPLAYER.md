# Multiplayer

## Identity

On first visit the client asks the server for nothing; identity is minted
when you create or join a voyage. The server returns a 32-byte random
`token` (base64url) which the client stores in `localStorage` under
`btw.seat.<CODE>`. The DB stores only `sha256(token)`. Separate Chrome
profiles / incognito windows have separate storage, so they are separate
players. Tokens are never included in any view, event, log line or page.

## Voyage codes

Four characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L).
~810k codes; generation retries on collision. Codes are case-insensitive on
input. Join link: `/v/CODE`.

## Create / join

HTTP (simple, testable, survives socket hiccups):

- `POST /api/voyages {callsign}` → `{code, token, role}`. Creator is seated
  as ENGINEER.
- `POST /api/voyages/:code/join {callsign}` → `{code, token, role}`. Second
  seat (NAVIGATOR). Errors: `404 not-found`, `409 full`, `409 started`
  (a stranger arriving after start), `400 bad-callsign`.

Callsigns: trimmed, 1–12 chars, letters/digits/space/`-_.'`; uppercased for
display. Rendered via React text / HTML-escaped on server pages.

Then the socket: `hello {code, token}` → server verifies the hash, binds the
socket to `(voyageId, role)`, joins it to the socket rooms, and pushes the
current `view`. Bad token → `hello-failed {reason}` and the client returns to
the join screen for that code.

## Roles

Assigned server-side by seat order: creator = Engineer, joiner = Radio
Officer / Navigator. Roles are shown in the lobby before Ready, so the pair
can see who is who. (Swap is a deliberate non-goal: one less thing to sync.)

## Readiness and start

`setReady {ready}` in LOBBY. Start happens when both seats are filled,
both ready and both connected; the server transitions to PROLOGUE. A player
disconnecting in the lobby clears their ready flag.

## Authoritative state, intents, views

Clients send `intent {seq, intent}`. The server validates (see PUZZLES.md
"Server validation summary"), applies, persists, then broadcasts a
`view` to each connected seat. Every view carries `rev` (monotonic per
voyage) so a client discards out-of-order views. The ack returns
`{ok, reason?, rev}`.

## Reconnect / refresh

Socket.IO reconnects automatically; on every (re)connect the client re-sends
`hello` and gets a full snapshot — there is no delta stream to resync. Refresh
is the same path: the token in `localStorage` restores the seat, role and
canonical state.

## Disconnect

Presence is tracked per seat (a seat may have several sockets, e.g. two tabs
of the same profile — both see the same view; this is the same player).
While a seat has no sockets for > 3 s during a live phase, the voyage is
**paused**: danger and timers freeze, the partner sees "Partner connection
lost — ship systems holding". It resumes when they return. A voyage with
nobody connected for 6 hours is marked ABANDONED by the sweeper.

## Third player

Join on a full voyage → `409 full`, shown as "This voyage already has two
crew. Start your own voyage." A stranger never receives a view.

## Stale and simultaneous inputs

- Intents are set-operations (`setValve {c, open:true}`), so duplicates are
  idempotent and the latest arrival wins.
- Intents for a phase that has ended are rejected `wrong-phase`.
- Node is single-threaded and each intent is applied atomically, so two
  simultaneous intents are serialised; completion is guarded so it fires once.
- Escape synchronisation uses server arrival times with a 3 s window, wide
  enough to absorb typical latency.

## Latency

Controls show immediate local "pressed" feedback (animation, click sound) but
the authoritative result arrives in the next view (typically < 100 ms locally,
< 400 ms on slow links). The client never predicts puzzle outcomes. A
connection banner appears when the socket is down.

## Replay

From SURVIVED/LOST either player sends `sailAgain`. The server creates a new
voyage (new code, new seed) with the same two seats and roles. The seat
token hashes are copied, so each player's existing token is valid for the new
voyage; the server emits `moved {code}` and each client copies its own token to
the new code's storage key. The voyages are linked via `prev_code`. The partner sees "ADA wants to
sail again" and is taken along. Old voyage stays in the log.
