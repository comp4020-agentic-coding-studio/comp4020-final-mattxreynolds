# Below the Waterline

A two-player, real-time, asymmetric 3D cooperative puzzle game that runs in
the browser. A cargo ship has been holed in a collision and is sinking. One
player is the **Engineer**, sealed in the Engine Room with the machinery. The
other is the **Radio Officer / Navigator**, trapped on the Bridge with the
diagrams, charts and radio. Neither of you can save the ship alone. You
have to talk.

## How to play

You need **two people, two browsers, and a voice channel**: a phone call,
Discord, or sitting next to each other. There is no in-game chat, by design.

1. Open the game at `/` and enter a callsign, then press **Create voyage**.
   You become the Engineer and get a four-character voyage code and a link.
2. Your partner opens that link (or enters the code under **Join a voyage**)
   in **their own browser**. On a single computer, use a second Chrome
   profile or an incognito window: two tabs of the same profile are the same
   player.
3. Both press **Ready**. Click into the 3D view to take the controls.
4. Describe what you see. Your partner's room is different from yours, and
   your controls change things in their room.

A first voyage takes about 10 to 15 minutes. Every voyage is generated from a
fresh seed, so the answers are different each time.

### Controls

| Input | Action |
|---|---|
| W A S D / arrow keys | Move |
| Mouse | Look (click the view to capture the mouse) |
| E or left click | Use the control under the crosshair. Hold it for hold-controls |
| Shift | Walk faster |
| Esc | Free the mouse and show the briefing card |
| R (briefing card) | Return to your starting point |
| M | Mute |

### What happens aboard

- **Prologue**: the ship is dark and alarms are sounding. The Engineer
  restores the emergency bus. The Bridge consoles come alive, and the
  Navigator acknowledges the alarm.
- **1 · Emergency Power**: the Engineer has six breakers marked with
  symbols, plus load studs and a generator meter. The Navigator has the
  damaged routing diagram and knows which symbol is shorted. Together they
  feed the pumps, radio and helm without overloading the generator.
- **2 · Flood Control**: the Engineer opens suction valves and reads line
  pressure. The Navigator runs the pumps and watches the flood map. Neither
  knows which pump draws from which compartment until one of you changes
  something and the other notices.
- **3 · Distress Signal**: the Navigator tunes while the Engineer watches the
  resonance needle. The Engineer then describes the rhythm of a pulse lamp.
  The Navigator finds it in the codebook, reads its bearing off the chart,
  and talks the Engineer's antenna round before transmitting.
- **Final escape**: the Navigator knows the pressure band the door rams need.
  The Engineer works the hand pump while the Navigator holds the door
  release. Then both pull their abandon-ship levers within three seconds of
  each other.

If the water wins, the ending says why. **Sail again** starts a new voyage
for the same crew in one click. Every voyage is kept in the
[Ship's Log](/history/).

## What "good" means for this game

> **[STUDENT REVIEW]** This section is a draft scaffold written during
> development. It states the design argument the build follows, but the
> course asks for *your* argument (about 400 to 600 words) with your own
> sources and judgement. Revise it, replace the bracketed prompts, and
> delete this note.

**The claim.** A good cooperative puzzle game creates moments in which two
people genuinely need one another. The best moments in this genre are not
"we solved it". They are "wait, *your* switch just moved *my* gauge". So
the game is judged on how often, and how clearly, it produces that kind of
dependence.

That breaks down into commitments the build tries to honour:

1. **Necessary asymmetry.** No core puzzle can be solved from one seat. The
   server sends each role a different projection of the canonical state, so
   this is enforced rather than merely suggested. The Engineer's browser never
   receives the diagram, the flood map or the pressure band.
2. **Cross-room causality.** Important actions show up in the other room
   within a second, with something to see as well as hear.
3. **Communication through interpretation.** Players describe shapes, rhythms,
   bearings and gauge behaviour rather than reading codes aloud. Puzzles use
   unnamed symbols on purpose.
4. **Pressure without cruelty.** Water rises, and mistakes add to it. Early
   phases still teach the interaction language, every wrong state is
   recoverable, and a disconnect pauses the ship rather than drowning the
   crew.
5. **Dense over large.** Two small rooms where every control matters.

**Alternatives considered.** [STUDENT REVIEW: discuss, e.g., a symmetric
design where both players see everything; a text-chat channel; a fixed
countdown timer; a larger explorable ship. Say why each was rejected. The
reasoning recorded during development is in `docs/PRODUCT.md`,
`docs/adr/` and `PROCESS.md`.]

**Sources and influences.** [STUDENT REVIEW: cite what actually informed
you. The brief names *We Were Here* and *Keep Talking and Nobody Explodes*
as genre references. This game borrows no assets, puzzles, text or
presentation from either. Add only sources you have actually read.]

**Deliberate omissions.** No built-in voice or text chat (ADR 004). No
accounts. No avatar of the other player. No mobile or touch play. No more
than two players. Each omission keeps the focus on the conversation between
two people.

**Testable vs qualitative claims.** These claims are checked mechanically in
`spec/`: two seats only, with distinct roles; neither role's network traffic
contains the other's information; a control change reaches the other browser
within a second; phase completion is decided by the server and fires once;
refresh, reconnect and server restart all restore the voyage; finished voyages
appear in the log after a restart. These claims need people: whether the
puzzles *feel* like they need both players, whether the difficulty and the
10 to 15 minute length are right, and whether failure feels fair.
[STUDENT REVIEW: no playtesting has been recorded yet. Add any you run.]

## Persistence and multiplayer

- Each player's identity is a random seat token kept in their own browser.
  The server stores only a hash of it. Refreshing or reconnecting restores
  the same seat, role and state.
- The server owns the game. Browsers send intentions ("close breaker 3"),
  never results. The server validates each one, applies it, and sends each
  player their own view.
- Everything lives in SQLite: voyages, crew, the full in-progress game state
  and a public event log. On Fly.io the database sits on the persistent volume
  at `/data`, so voyages survive the machine stopping, restarting and being
  redeployed. An in-progress voyage resumes where it was.
- If one player drops out mid-voyage, the ship holds (no rising water) until
  they return.

## Running it locally

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev                 # http://localhost:8080 with hot reload
pnpm build && pnpm start # production mode
```

Checks:

```sh
pnpm test:unit                       # pure game logic, no server needed
node scripts/check-local.ts          # build, start a throwaway server, run everything
pnpm check                           # the course command: needs an app at APP_URL
pnpm check:evidence                  # process evidence
```

More detail is in `docs/`: product and scope, game design, the full puzzle
specification, architecture, the multiplayer protocol, visual direction and
deployment. Decisions are recorded in `docs/adr/`.
