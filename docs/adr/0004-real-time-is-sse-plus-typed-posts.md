# Real-time is Server-Sent Events plus typed POSTs, resynced by snapshot

The brief asks for changes to appear in another session within about a second, with no reload. We keep SSE for everything the server pushes (Deck state, the Clock, Strikes, live Leaderboard entries) and plain POSTs for every action, on the same origin as the page so the `httpOnly` session cookie from [ADR 0002](0002-person-is-a-guest-or-account-behind-a-session-cookie.md) rides on both. The first event on every SSE connection is the full state of that Player's Deck, so a reconnect needs no replay; the server sends a comment heartbeat every 15 s; and the client recreates its `EventSource` with backoff whenever it reaches `CLOSED`.

## Considered Options

- **WebSockets (`ws`, or Socket.IO):** the usual choice for "real-time". Rejected because the traffic is a few pushes a minute and an intent every few seconds, and the position sync that would have justified them was removed by [Does the world take 3D form, and for which Player?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/8). They also force an error protocol of our own for what HTTP already says (409 stale, 429 throttled, 403 not yours), and a reconnect and resync routine we'd write by hand. `ws` stays the runner-up if per-frame throttling is ever needed.
- **WebTransport:** needs HTTP/3, which Fly's HTTP proxy doesn't offer.
- **Polling about once a second:** costs real CPU against a 6.25% baseline and keeps the machine awake exactly as an open stream does.

## Consequences

- `EventSource` stops for good on any non-200 response, and Fly's proxy can answer 502 or 503 during a cold start or redeploy. The client must therefore recreate it, not trust its built-in retry.
- Fly's proxy closes idle connections at about 60 s; one recent community report shows stalled streams reset at about 30 s. The 15 s heartbeat leaves margin for both.
- Whether an open stream reliably keeps the machine awake is unverified (the Fly docs say "traffic", community threads disagree). The Clock only runs while both connections are open, so an auto-stop looks like a disconnect and the Voyage freezes safely. This is measured on the first deploy, not assumed.
- Dead Air's client races (a late POST response overwriting a newer SSE state) are avoided by making SSE the only source of client state, with a revision guard, as Dead Air did after the fact.

Evidence: [the stack comparison](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/stack-comparison/docs/research/stack-comparison.md) and [What do real-time transport and persistence cost on the course Fly setup?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/realtime-on-fly/docs/research/realtime-on-fly.md).
