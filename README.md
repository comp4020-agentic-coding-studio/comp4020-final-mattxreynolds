# Below the Waterline

Below the Waterline is a two-player cooperative puzzle game about saving a
sinking cargo ship. One player is the Engineer below decks; the other is the
Navigator on the Bridge. Each has controls and information the other needs.

## How to play

[Play the game](/) with a partner, two separate browsers and a voice channel,
such as Discord or a phone call. Enter a callsign and create a voyage, then
send your partner the joining link or voyage code. Both press **Ready**.
On one computer, use separate Chrome profiles or an incognito window.

Click into the view, use WASD to move, the mouse to look, and E or left click
to interact. Esc releases the mouse and opens the briefing. Touch controls
appear automatically on phones and tablets. Describe what you see and listen
to your partner: their room contains a different part of the problem.

## What good means here

For me, good means **cooperation under tension**. Each player should need their
partner's help, with water rising and something else demanding attention. What one person sees should help the other decide
what to do. Both should have a reason to speak up, listen and act.

My main influences were *Keep Talking and Nobody Explodes* and *We Were
Here*. In [Keep Talking](https://keeptalkinggame.com/), one person sees the
bomb while the others have the instructions. That split makes talking part
of solving the puzzle, and the timer makes it urgent. In a [We Were Here
developer interview](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-total-mayhem-games-i-we-were-here-i-),
Lucia De Visser describes the fun of explaining something your partner can't
see, and how suspense makes puzzles harder and more exciting. Benjamin Van
Hemert also points out how difficult it is to keep both players involved.
That's a useful standard for this game: giving players different information
only works if both have something worthwhile to contribute.

[Ben Kane's design talk](https://media.gdcvault.com/gdc2016/Presentations/Kane_Ben_Designing_Asymmetric_Gameplay.pdf)
explores how communication challenges create stress, alongside the need for
clear rules and avoidable mistakes. For me, that means players should be able
to look back at a failed voyage and work out what they'd do differently.
I don't expect a first-attempt escape. In playtesting, players learned what
to avoid, came up with different approaches and got faster at tasks each time
they tried them. That suggests failure helps them learn, though each puzzle's balance still
needs judgement.

Flooding, generator heat and damage mean earlier mistakes can make later
tasks harder. The debrief lets the pair look back over what happened before
trying again. If someone disconnects, the danger pauses until they return.
A dropped connection shouldn't cost them the voyage.

I left out built-in chat, accounts, avatars and matchmaking deliberately.
You bring a partner and a voice channel, then join through a code. There's
little setup between deciding to play and starting to figure things out
together.

## What the tests can tell us

Each player has a separate browser identity and occupies one of two roles
in a shared voyage. Socket.IO sends role-specific updates, so actions appear
in the other browser within about a second without reloading. SQLite on
Fly's persistent volume saves voyage state and outcomes across sessions,
restarts and redeploys. Finished voyages stay in the [Ship's Log](/history/).
Tests in `spec/` check identity, private information, updates, reconnects and
persistence.

Judging the experience takes people playing it. Do both roles feel needed? Does the pressure keep them
engaged? Does losing give them an idea for the next attempt? The playtesting observations help answer those
questions. Passing tests alone can't tell me whether the game is good.
