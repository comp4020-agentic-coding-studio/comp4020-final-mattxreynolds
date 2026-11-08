# Process

## Starting small, then starting again

I started with Dead Air, a simple cooperative game inspired by *Keep Talking
and Nobody Explodes*. It gave me a manageable way to build around two people
holding different information. The first version had randomised modules,
separate seats and a persistent run history
([`2c02f96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/2c02f96)).
I wanted to take that communication mechanic into a space players could
explore, with more atmosphere and more interesting things to do together.

For the first 3D attempt, I used a workflow built around Matt Pocock's skills.
There were prototypes comparing interactions and ways of presenting the
world ([`defd1e0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/defd1e0)),
followed by a Svelte/Hono implementation. I wasn't happy with its appearance
or gameplay, and the workflow felt like a lot of unnecessary effort for what
it produced. I started again in a separate project without using that skills
workflow. The result became Below the Waterline.

That doesn't establish that the skills caused the problems. It was my
experience of that attempt, and enough reason to try another approach. The
[earlier harness](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/3116870/CLAUDE.md)
and [later import](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/8a1be4a)
preserve the record of both versions.

## Giving the agents a foundation

The new build used Claude Code with Opus 5.5. Before implementation, the agent
recorded the product, puzzles, architecture and constraints
([`f73b184`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/f73b184)).
[CLAUDE.md](CLAUDE.md) made those commitments instructions for later work:
the server owns the game, each role receives only its own information, and
reconnecting restores the voyage.

React Three Fiber let room controls be components alongside React overlays.
That meant a larger bundle and care around rendering performance; [ADR
001](docs/adr/001-browser-3d-r3f.md) records the alternatives. Express and
Socket.IO kept the application in one Node process. Role-specific snapshots
made reconnects straightforward and kept the partner's clues out of network
traffic ([ADR 002](docs/adr/002-server-authoritative-state.md)). SQLite fitted
the course's single machine and persistent volume without another service
([ADR 003](docs/adr/003-sqlite-persistence.md)). This suited a small game,
with the constraint that live sessions and writes share one process.

The lead agent built a working slice before delegating: create, join,
persistence and an action affecting the other room
([`cb41ac9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/cb41ac9)).
Shared control IDs, symbols and a screenshot tool followed. Agents could then
build separate rooms and reliability checks against those interfaces. The
[architecture](docs/ARCHITECTURE.md) and later [workstream
plan](docs/production/PLAN.md) explain ownership. This still needed integration
and review, but gave each agent a defined area to work in.

## Checking whether cooperation was necessary

One of the most useful findings was that different information didn't
necessarily make players depend on each other. An audit found ways through
all four original puzzles without communication. A solo Engineer could try
breaker combinations using the load meter; holding the escape release while
pumping steadily also worked.

The agent tested those strategies before changing the rules. The generator
rating moved to the Bridge, incorrect breaker combinations became costly,
and excess pressure made the escape rams slip. The changes and measurements
are recorded in
[`591de31`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/591de31)
and [`fbc93ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/fbc93ca).
Increasing penalties also made a careful crew's voyage too punishing, so the
background danger rates were reduced
([`0102dba`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/0102dba)).

The audit became a rule in CLAUDE.md: simulate play without communication
when changing puzzles. Regression tests protected the changes. Later, a
strategy that reacted to live gauges found another route through Flood.
The [puzzle specification](docs/PUZZLES.md) records that limitation, and the
agent instructions now require reactive strategies too.

This matters to my definition of good. A test proving that a pair can finish
only establishes one route through the game. Testing what happens when they
don't talk gets closer to checking whether cooperation actually matters.
The remaining shortcuts mean I can't claim that every puzzle forces it.

## Making earlier decisions matter

The first build treated the ship mostly as a setting for separate puzzles.
Once a puzzle was complete, its machinery stopped being a concern. The next
cycle added a continuous simulation: generator heat, water and hull damage
keep developing as players move through the voyage
([`4dc5c37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/4dc5c37)).

That gave cooperation consequences over time. A mistake with the generator
could leave less capacity later; damaged pumps could make flooding harder
to manage. [ADR 005](docs/adr/005-five-acts-ship-simulation.md) explains why
the existing phase structure was kept, with continuous systems underneath,
instead of rewriting everything as a general simulation. [SYSTEMS.md](docs/SYSTEMS.md)
records the resulting behaviour. The cost was more balancing and more ways
for an early mistake to affect the rest of an attempt.

Initial balance estimates came from scripted crews. Only the final version
was playtested by people: two separate pairs. They learned what not to do,
came up with approaches to try differently and completed tasks faster with
repetition. That supports the learning through failure I wanted. It doesn't
settle every question about difficulty or prove that each system helped.
The debrief gives players a way to look back at the consequences before
trying again.

While finalising the README, I looked at developer accounts from both games
that inspired me. [Kane's talk](https://media.gdcvault.com/gdc2016/Presentations/Kane_Ben_Designing_Asymmetric_Gameplay.pdf)
helped me articulate why failure needs clear rules. The [We Were Here
interview](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-total-mayhem-games-i-we-were-here-i-)
also raised the difficulty of keeping both roles involved. These readings
helped me assess the result; they weren't sources I'd used during the build.

## When the visuals slowed the game down

A later production pass added detailed machinery, reflections and effects.
After these additions, browser checks started missing their update
budget. The development log records initial explanations about machine load;
profiling then found shader compilation freezing software-rendered browsers
for roughly four to six seconds.

The fix introduced a lighter rendering path and made the loading screen wait
for staged room compilation
([`5835042`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/5835042)).
[ADR 007](docs/adr/007-render-look-and-quality-tiers.md) records the measurements
and trade-offs. Software-rendered sessions get simpler materials, while
hardware capable of the full effects keeps them. Later, keeping one canvas
through the voyage removed another freeze during the ending.

The correction also reached [CLAUDE.md](CLAUDE.md): graphics changes need
profiling in two browser contexts, and new materials must respect quality
settings ([`57b0712`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/commit/57b0712)).
Appearance was one reason I'd restarted, so improving it mattered. This
regression showed how easily that work could interfere with players seeing
and responding to each other's actions. Keeping the responsiveness checks
made that cost visible.
