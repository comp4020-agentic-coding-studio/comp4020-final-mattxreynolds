# Act on the mission the crew actually saw

Dead Air depends on describing a device, reading back an instruction and then
acting. Two requests can arrive in order yet refer to the same old keypad
stage or switch position. Processing both against whatever is current makes
network timing into a mistake the crew never made.

## Considered options

- **Apply every arrival to current state.** Simple, already serial in one Node
  process, but duplicate flips cancel and repeated keys hit unseen stages.
- **Reserve one exclusive Operator seat.** Removes competing Operators but
  requires ownership, takeover and disconnected-seat policies; prevents the
  existing solo tabs/shared exploration. Expert lifecycle actions still race.
- **Merge commands by module.** Allows independent actions concurrently but
  needs per-module dependencies (override, strikes, mission reset, timer).
  Encourages parallel clicking instead of a deliberate read-back.
- **Require the observed mission and room revision.** First valid arrival
  wins; other commands based on that snapshot are refused without a strike.
  The crew reads back the updated state and explicitly acts again.

## Decision

Choose observed-state commands. Every POST supplies `missionNo` and `revision`
from its view. The single server compares them before applying a validated
intent, increments the revision once for an accepted command or timeout, and
persists before broadcasting. A conflict returns 409 with the current
role-filtered view. Even a duplicate request cannot act twice; there is no
automatic retry or offline command queue. This is rejection-based duplicate
protection, not a promise of replaying a cached success response. An
acknowledgement wait is bounded to five seconds; timeout reports uncertainty
and releases pending controls once the stream is live.

Presence changes do not invalidate instructions. SSE is the client's source
of room views; HTTP acknowledgements cannot roll it back. On a broken link,
controls pause until a fresh full snapshot arrives. The mission deadline keeps
running without the crew; reconnect restores the current run or its final
result, never restarts it. The station log updates live in other open lobbies.

## Consequences and costs

One room-wide revision deliberately rejects concurrent changes even to
unrelated modules and simultaneous Begin commands. There is no fairness
promise beyond server arrival order. A lost acknowledgement leaves a player
uncertain: consult the recovered view before choosing a new action. Presence
reports open streams, not proof someone is listening; abrupt network loss may
be detected later than an explicit leave. The clock uses a server deadline and
approximate client offset; it is not sub-millisecond synchronisation.

This depends on one Node process and one SQLite volume, matching the existing
Fly deployment. Multiple servers would require shared sequencing/pub-sub.
No accounts, exclusive seats, adversarial role security, historical event
replay, or indefinite retention of deduplication receipts are introduced.
