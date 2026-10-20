# Dead Air

A two-seat browser defusal game inspired by *Keep Talking and Nobody Explodes*.
The Operator has the device; the Expert has the manual. Talk to finish before
the clock runs out. Every completed run joins a shared station history.

Play at <https://comp4020-final-mattxreynolds.fly.dev>.

## What good means here

Dead Air is good if it makes two people talk properly: asking questions,
reading instructions back and slowing down when the clock says hurry up.

1. **Talking is the game.** Randomised devices and general rules mean the
   Expert must ask what the Operator sees.
2. **A stranger starts within a minute.** Open a room and share its code;
   teammates join from their own screens without accounts or installation.
3. **It's fair.** The manual solves every device. A strike should come from a
   mistaken instruction, never an invisible network race.
4. **The station remembers.** Crews, progress and outcomes survive restarts;
   returning browsers see their runs among everyone else's.

## Who it's for

Pairs in the same room: classmates at a crit or a showcase full of crews.
Each pair opens a room so their devices stay separate. Play solo by switching
seats when practising.

A person is an anonymous browser profile, recognised by a server-issued secret
stored locally. Separate profiles get separate public tags; callsigns are
editable labels that may match. Your tag appears in the lobby and crew list.
Clearing storage makes a new person. Use fictional callsigns: names and tags
appear publicly in crew history and operational logs.

## Playing together

One player opens a room; the other enters its four-character code and chooses
Expert. Begin starts five minutes; a device input also starts the clock. Clear
all five modules, leaving the override last. Three strikes end the run.

Seats are switchable views. The server omits devices from Expert responses
and refuses Expert device inputs; either seat can Begin or load the next
mission. Anyone with a code may select Operator. Codes invite teammates;
they provide no protection for sensitive information. Only your browser's
credential can rename your identity. Completed crews remain as played.

The server owns rules, deadlines and persistence. SSE carries room changes and
station history. First valid arrival wins when commands describe the same
revision; stale/duplicate inputs are refused without a strike. Read back the
updated device before choosing again. The [decision record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/main/docs/adr/0001-observed-state-actions.md)
explains the trade-off.

A lost link pauses controls until a fresh snapshot arrives. The clock keeps
running. Lost acknowledgements are bounded and never automatically replayed;
check the recovered device. Temporary startup failure preserves your identity
and offers Retry.

## What I looked at and left out

*Keep Talking and Nobody Explodes* supplies asymmetric information;
*Spaceteam* supplies spoken co-operation; *Hanabi* makes limited information
valuable. Robin Sloan's [home-cooked apps](https://www.robinsloan.com/notes/home-cooked-app/)
and Clay Shirky's [situated software](https://wiki.xxiivv.com/docs/situated_software.html)
support designing for particular people and moments. Accounts would cost the
first minute; built-in chat would replace talking; ranked scores would reward
memorisation. Five modules fit one short conversation.

## Checking the promises

`pnpm check` protects rules, persistence, identity, information separation,
conflicts and recovery using HTTP, SSE and independent desktop/narrow browsers.
Talking and a stranger's first minute require watching first-time pairs;
scripted rehearsals cannot establish those judgements.

Server JSON events identify public tags, actions, progress and rejections.
Watch with `mise exec -- flyctl logs -a comp4020-final-mattxreynolds`.
The [operations guide](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/main/docs/observability.md)
explains permissions, privacy, local setup, deployment and log-only narration.
