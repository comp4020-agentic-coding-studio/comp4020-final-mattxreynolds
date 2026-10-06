# Dead Air

A two-seat defusal game for the browser, inspired by *Keep Talking and Nobody
Explodes*. The Operator has the device and the Expert has the manual. Neither
one can finish alone, so the only way through is to talk. Every run, won or
lost, goes on a station log that everyone can see.

Live at <https://comp4020-final-mattxreynolds.fly.dev>.

## What good means here

Dead Air is good if it makes two people talk to each other properly: asking
questions, reading things back, and slowing down when the clock says hurry up.
Specifically:

1. **Talking is the game.** Each seat holds half of what's needed. Devices are
   randomised and the manual is written as general rules, so the Expert can't
   memorise answers and has to ask what's in front of the Operator.
2. **A stranger is playing within a minute.** There's no account and no setup.
   You open a room, and either play both seats yourself or send the code to
   whoever is next to you.
3. **It's fair.** Every device can be solved from the manual alone, so a strike
   is a misunderstanding between two people, not the game cheating.
4. **The station remembers.** A run leaves a trace with the crew's callsigns,
   how far they got and how it ended. Coming back shows you your own runs
   among everyone else's.

## Who it's for

Pairs of people in the same room: two classmates at a crit, or a room full of
pairs at the showcase all playing at once. Every visitor gets their own room,
so a dozen pairs can play side by side without stepping on each other's
devices.

## What I looked at

- *Keep Talking and Nobody Explodes* (Steel Crate Games): the split between
  device and manual, and modules whose rules depend on details only one person
  can see.
- *Spaceteam* (Sleeping Beast Games): co-op that's played out loud, where the
  chaos of the talking is the point.
- *Hanabi*: a co-op game built entirely on limited information, where
  communication is the scarce resource.
- Robin Sloan, "An app can be a home-cooked meal", and Clay Shirky,
  "Situated Software": small software made for particular people and a
  particular moment, which is what a crit or showcase game is.

## What I chose not to build

- **Accounts.** A callsign and an anonymous id kept in the browser are enough
  to leave a trace, and a login would cost the first minute.
- **Voice or text chat.** Players are meant to be in the same room. Talking out
  loud is the game, so I'm not rebuilding it.
- **A ranked leaderboard.** The log is a record of crews, not a race. Fastest
  times would reward memorising the manual over talking.
- **More modules.** Five is enough for a five-minute run, and each new one has
  to be described out loud by a stranger.

## Which claims are enforced and which are judged

| Claim | How it's held |
| --- | --- |
| Every finished run is logged with its crew and visible to everyone | `spec/game.test.ts` |
| Rooms are isolated from each other | `spec/game.test.ts` |
| The Expert's seat never receives device data | `spec/game.test.ts` |
| One player's action reaches another open session within a second | `spec/game.test.ts` |
| The manual alone is enough to defuse any device | `spec/game.test.ts`, `spec/rules.test.ts` |
| Talking is the game | Judged: watching pods play at the crit |
| A stranger is playing within a minute | Judged: timing first-time players at the crit |

The checks run against the live app with `pnpm check`. The judged claims are
what I'll be watching for at the crit, and the notes go into `PROCESS.md`.
