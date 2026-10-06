# Process overview

## From the brief to Dead Air

The brief asks for a multi-user, real-time website that's good, and warns that
an agent left to itself builds the median answer. Before touching this repo I
used Claude Code to compare two directions: an asymmetric co-op game in the
spirit of *Keep Talking and Nobody Explodes* and *Spaceteam*, or a small party
board game with simultaneous trivia. I went with the co-op game. Its multi-user
part isn't bolted on: the game doesn't exist without two people, and the
information split between them gives the server a real job, since it has to
make sure the Expert never sees the device.

I then built a throwaway static prototype, *Dead Air*, outside this repo: one
page, three fixed modules and two role tabs, with no server. It fixed the look
and the feel of the two seats before I committed to a stack. This repo starts
from that prototype.

## How I directed the build

I ran the first build as one long Claude Code session the night before crit 8,
with a deliberate rule: the agent asks me questions in batches before writing
code, and only stops when the prototype is ready to show. Three batches set
the design:

- **Stack, multiplayer, persistence and modules.** The agent recommended
  vanilla JS on Express as the fastest port of the prototype. I chose Vite,
  React and Express instead, because that's the stack I can explain and extend
  for four more weeks. For multiplayer it offered "room codes" or "local tabs",
  and I asked for both. Every visitor gets their own room, so pairs at the
  crit don't collide, and both seats stay available in one browser so one
  person can test alone. I picked the keypad and switch panel from four
  proposed modules.
- **Variation, timer, identity and deployment.** The prototype's device was
  fixed, so a logged, replayable run would turn into a memory test. I chose
  randomised devices with a manual of general rules, kept the 5:00 clock and
  3 strikes, and chose an auto-generated, editable callsign over a login gate.
  I kept deployment local for the session so I could deploy myself.
- **Harness, checks and the run lifecycle.** I asked for a draft CLAUDE.md for
  me to rewrite, spec checks for every promise, and a new device in the same
  room after each run.

The dev server ran from the first minute ([`4a59ac1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/4a59ac1)),
so I could watch the build come together in the browser, and the agent
committed at each working step.

## Stack, and why

| Choice | Over | Because |
| --- | --- | --- |
| React client built by Vite | Porting the prototype's vanilla JS | Five modules and two seats are component-shaped, and it's my stack. It cost a rewrite of the prototype's markup on the first night. |
| Express, TypeScript run directly by Node 24 | A compiled server or a zero-dependency `node:http` server | Type stripping means no server build step. In dev, Express mounts Vite as middleware, so dev and production are both one process on :8080. |
| SQLite via `node:sqlite`, on the `/data` volume | Postgres with Prisma | The course's Fly setup gives one 256 MB machine and one volume, with no database server. `node:sqlite` is built into Node, so there's no native module to compile in the image. |
| Server-sent events for updates, POST for actions | WebSockets, or polling | Updates only flow server-to-client, and actions are ordinary requests. SSE reconnects by itself and passes through Fly's proxy. The trade-off is that an open tab keeps the machine awake. |

The server is the authority: clients send intents like "cut wire 2", and only
the server judges them. Each rule's manual text and its logic live side by side
in `shared/game.ts`, so the manual the Expert reads and the check the server
runs come from the same place ([`2c02f96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/2c02f96)).
Rooms are written through to SQLite on every change, so a live mission
survives a restart or redeploy with the same device, strikes and deadline.

## Grounding the work

The agent's claims about the game are only as good as what checks them, so
the promises the README makes are tests against the running app
([`e2ea270`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/e2ea270)).
One test plays a whole device through the API using only the manual's rules.
Another generates 2000 random devices and checks each module has exactly one
answer. The agent also drove the real UI in a headless browser: two separate
players joining by code, a full defuse through the buttons, and both marking
viewports, with screenshots I could check.

## Corrections

- **A malformed action started the clock.** Probing the API showed that a
  request with no body crashed with a 500, and a `cut` with a nonsense wire
  started the countdown before being refused. The fix validates an action's
  shape first, and a spec check now holds it
  ([`0db8377`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/0db8377)).
- **The station log grew without limit.** After the first build I asked for
  the lobby's log to stop growing. It now shows the latest eight runs, while
  every run stays in the database so totals and personal records still count
  them all ([`6dac076`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/6dac076)).
- **Mobile layout.** Screenshots at 390px showed the override button squeezed
  into a tall column. It was fixed before the client was committed
  ([`5c9f6f6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/5c9f6f6)).
- **Feedback you can feel.** Watching a run end showed that a strike and a
  finished mission were easy to miss, especially on a phone. The console now
  shakes on each strike on both screens, and shows an end-of-run banner
  ([`865cd1e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/865cd1e)).

## The harness

CLAUDE.md started as an agent draft of the rules this session followed: the
server is the authority, the Expert never gets the device, rule text and logic
change together, every README promise gets a check, fit the Fly box, keep the
prototype's look, and check both viewports. I'll rewrite it in my own terms
before crit 9. When the agent gets something wrong, the correction should land
there or in `spec/` rather than as another retry.

The agent flagged that the brief advises drafting the README and this document
yourself. I had it draft both from the session and from my answers, then
reviewed and edited them. The definition of good is mine to defend at the crit.

## Next

Week 10 asks for real-time, which SSE already covers, so that week goes on a
written multi-user decision: what happens when both seats press at once.
Week 11 adds server-side logging. The judged claims in the README, that talking
is the game and that a stranger is playing within a minute, get tested by
watching pods play at crit 8.
