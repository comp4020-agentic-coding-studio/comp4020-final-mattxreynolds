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
3. Both press **Ready**. Click into the 3D view to take the controls (on a
   phone or tablet, tap **Tap to take the controls**).
4. Describe what you see. Your partner's room is different from yours, and
   your controls change things in their room.

A voyage starts with a short cinematic (skip it with Space). The full
voyage runs five acts, about 15 to 20 minutes. Most crews won't escape on
their first try, and that's intended. Each attempt teaches you the ship, and
the early acts go much faster the second time. Every voyage is generated
from a fresh seed (the "ship number"), so the answers change each time. You
can also replay the same ship on purpose.

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

**On a phone or tablet** the game switches to touch controls by itself.
Landscape works best. You still need a voice call: a phone in landscape with
earbuds on a call works, or use a second device for the call.

| Touch | Action |
|---|---|
| Left thumb, drag | Walk. The stick appears where your thumb lands |
| Right thumb, drag | Look around |
| Tap a control in the view | Use it. Keep your finger still on a hold-control to hold it |
| **USE** button | Use the control under the reticle ◎. Keep it pressed for hold-controls |
| **❚❚** button | Pause: the briefing card, settings, full screen, return to start |
| Sound button | Mute |

The game follows whatever you last touched: on a touchscreen laptop, using
the mouse switches back to keyboard-and-mouse controls.

### What happens aboard

One ship, one continuous disaster, five acts. The ship's systems run on the
server the whole way through: an electrical grid with a generator that
heats up and trips, water in three compartments with pumps, valves and
leaking seams, and hull damage that gets worse. Decisions in early acts
carry forward. Every breaker trip in Act I permanently wears the generator,
so you have less power for the rest of the voyage. Every pump you burst or
run dry cracks a seam that keeps leaking. The debrief tells you which of
these cost you.

- **Act I · Impact.** The ship is dark and alarms are sounding. The
  Engineer restores the emergency bus, and the Bridge consoles come alive.
  Then **Emergency Power**: the Engineer has six breakers marked with
  symbols, with load studs and a meter. The Navigator has the damaged
  routing diagram, knows which symbol is shorted, and knows the generator's
  rating. Feed the pumps, radio and helm without overloading the generator.
- **Act II · Stabilisation.** The Engineer opens suction valves and reads
  line pressure. The Navigator runs the pumps and watches the flood map.
  Neither knows which pump draws from which compartment until one of you
  changes something and the other notices. An open valve with no pump lets
  the sea back in. A pump left on an empty compartment seizes, and only the
  Navigator can see when that's about to happen. The **Aux Machinery Room**
  opens behind the Engine Room: the generator's heat gauge and RESET button
  are in there, and from now on the Engineer has to keep an eye on them.
- **Act III · Mayday.** The Navigator tunes while the Engineer watches the
  resonance needle. The Engineer then describes the rhythm of a pulse lamp.
  The Navigator finds it in the codebook, reads its bearing off the chart,
  and talks the Engineer's antenna round before transmitting. The Bridge's
  **Comms Room** opens: its distribution panel switches the lighting, radio
  and evacuation circuits.
- **Act IV · Cascade.** Charge the evacuation accumulator while everything
  else goes wrong. Hull breaches open one after another, and only the Bridge
  sees where. The pumps (two of them, three compartments) have to follow.
  The accumulator, pumps, radio and lights together are more than a worn
  generator can carry, so the Bridge sheds load and the Engineer watches the
  heat. Twice, a coast station calls. The Bridge sees the bearing, the
  Engineer turns the antenna, the Bridge answers. Each answered call gives
  you more time in the final escape.
- **Compartment fire (Acts III–IV).** At a seeded moment a fire breaks out
  below decks. The Engineer's fire panel in the Aux Machinery Room shows the
  smoke and a class mark, but not where it is or what to do. The Bridge's
  damage-control card in the Comms Room shows the compartment and a
  procedure book: for each class mark, the order to throw five isolators.
  The Engineer reads the mark aloud, the Bridge reads back the order, and the
  Engineer throws it. A wrong throw makes it flare and locks the panel for
  a few seconds. Left burning, it feeds water into its compartment, derates
  the generator and finally flashes over, cracking a seam for good. It never
  ends the voyage on its own.
- **Act V · Abandon Ship.** The water keeps coming. The Bridge arms the
  lifeboat davits (they need the accumulator). The Navigator knows the
  pressure band the door rams need. The Engineer works the hand pump while
  the Navigator holds the door release and calls "more" or "stop". Too much
  pressure and the rams slip and the door closes again. Then both pull
  their abandon-ship levers within three seconds of each other.

If the water wins, the ending says why. The **incident reconstruction**
replays the voyage from the server's event log: a scrubbable timeline of
flooding, compartment levels and generator heat, with the closest call,
trips, the distress-call time, the escape margin and plain-language lessons.
Every debrief is kept at `/log/CODE/`. **Sail again** starts a new ship for
the same crew in one click, or **sail this same ship again** to put what you
learned to use. Every voyage is kept in the [Ship's Log](/history/).

### Modes and practice

- Surviving a full **Standard Voyage** unlocks four challenge modes for that
  crew: **Rough Seas** (heavy rolling, a hotter generator, leakier rams),
  **Blackout** (a weaker generator; the rooms run on emergency lamps),
  **Rapid Flood** (much faster water, stronger pumps) and **Chain Reaction**
  (a generator trip bursts a pump; a lost compartment leaks into its
  neighbours). Surviving two of those unlocks **All Systems**.
- Once a crew has reached an act on a full voyage, they can **practise**
  from it. A practice run starts with the earlier acts set up as a clean
  crew would leave them. It is labelled PRACTICE everywhere, never counts as
  surviving, and never unlocks anything.
- Unlocks belong to the pair. Sail Again keeps them, and creating a new
  voyage from the same browser carries them over.

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
accounts. No avatar of the other player. No more than two players. Each
omission keeps the focus on the conversation between two people.

**Testable vs qualitative claims.** These claims are checked mechanically in
`spec/`: two seats only, with distinct roles; neither role's network traffic
contains the other's information; a control change reaches the other browser
within a second; phase completion is decided by the server and fires once;
refresh, reconnect and server restart all restore the voyage; finished voyages
appear in the log after a restart. These claims need people: whether the
puzzles *feel* like they need both players, whether the difficulty curve (a
first escape after a few attempts) and the 15 to 20 minute full voyage are
right, and whether failure feels fair. The balance numbers come from scripted
simulations of talking and non-talking crews (`spec/*.unit.test.ts`), not
from people.
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
- An active voyage survives a server restart in any act, including its ship
  systems (grid, wear, water, breaches, accumulator). Significant events are
  recorded in order with sequence numbers, and each finished voyage's
  debrief is stored with it.

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
