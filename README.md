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
   randomised and the manual gives general rules, so the Expert has to ask
   what's in front of the Operator.
2. **A stranger is playing within a minute.** There's no account or setup.
   Open a room, play both seats yourself or share its code with a teammate.
3. **It's fair.** Every device can be solved from the manual alone. A strike
   should be a misunderstanding between people, not an invisible network race.
4. **The station remembers.** Runs record the crew's callsigns, progress and
   outcome. Returning players see their own runs among everyone else's.

## Who it's for

Pairs in the same room: classmates at a crit, or a showcase full of pairs.
Each pair opens its own room, so they don't disturb each other's devices.
Seats can be switched for solo play; they are information views, not exclusive
ownership or security against someone deliberately switching roles.

## Playing together

Mission changes and finished runs reach open seats and station logs through
server-sent events. The server judges actions and owns the deadline.

When two actions use the same observed state, the first valid arrival wins.
The other is refused **without a strike**: read back the updated device and
choose again. Duplicates cannot flip twice or press unseen keypad stages. This favours
communication over parallel clicking, including on different modules. The [decision record](docs/adr/0001-observed-state-actions.md)
explains the alternatives and costs.

A lost link pauses controls until a fresh snapshot arrives. The clock keeps
running; rejoin restores the mission or final result. Lost acknowledgements
are not retried: check the recovered device before acting again.

## What I looked at

- *Keep Talking and Nobody Explodes* (Steel Crate Games): split information
  and rules depending on details only the Operator sees.
- *Spaceteam* (Sleeping Beast Games): spoken co-operation under pressure.
- *Hanabi*: limited information makes communication scarce.
- Robin Sloan, "An app can be a home-cooked meal", and Clay Shirky,
  "Situated Software": software for particular people and moments.

## What I chose not to build

Accounts would cost the first minute. Voice/text chat would replace the
out-loud conversation. A ranked leaderboard would reward memorising answers;
the log records crews instead. Five modules are enough for a five-minute run.

## Which claims are enforced and which are judged

| Claim | How it's held |
| --- | --- |
| Finished runs persist with their crew | `spec/game.test.ts`, `spec/persistence.test.ts` |
| Rooms stay isolated; Expert projections omit device data | `spec/game.test.ts`, `spec/realtime.test.ts` |
| Relevant open seats and station logs update within a second | `spec/realtime.test.ts`, `spec/browser.test.ts` |
| Stale/duplicate commands cannot act twice; reconnect restores state | `spec/multiplayer.test.ts`, `spec/browser.test.ts` |
| The manual solves every device | `spec/game.test.ts`, `spec/rules.test.ts` |
| Talking is the game; strangers start within a minute | Judged by watching first-time pairs |

`pnpm check` runs against a running app, including independent browser contexts.
Local timings are evidence, not a guarantee on every network. Human pod
judgement remains to be recorded in `PROCESS.md`.
