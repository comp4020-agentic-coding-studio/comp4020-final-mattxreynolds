# Cooperative puzzle game

A two-player cooperative browser puzzle game in which each Player is shut in a separate Room holding the Clues for the other's Puzzles, and talking out loud is the only way through.

## People

**Person**:
Someone the game recognises across attempts: either a Guest or an Account.
_Avoid_: User, visitor, profile

**Guest**:
A Person known only by their browser, given a generated pseudonym; can become an Account without losing their history.
_Avoid_: Anonymous, temp user

**Account**:
A Person known by a username and password they chose, recognised in any browser.
_Avoid_: Login, profile, member

**Display name**:
What other Players see of a Person: the pseudonym for a Guest, the username for an Account.
_Avoid_: Nickname, handle

**Player**:
A Person's role in one Team, holding one Room in an attempt.
_Avoid_: User, client, participant

**Team**:
Exactly two Players attempting the game together; the same two Persons are the same Team whichever Rooms they take.
_Avoid_: Crew, pair, party, group

**Room**:
One of the two separated spaces in an attempt, chosen by one Player and hidden from the other, holding the Clues for the other Room's Puzzles.
_Avoid_: Level, side, half, station, view, screen

## Puzzles

**Puzzle Type**:
A kind of puzzle with its own shape of split information: lock-and-clue, blind navigator, or split instrument.
_Avoid_: Minigame, challenge, category

**Puzzle**:
One authored design of a Puzzle Type that yields fresh answers and Clues every time it is drawn, such as the mural keypad.
_Avoid_: Template, generator, level

**Clue**:
Something in one Room that the other Player needs to solve a Puzzle in their own Room.
_Avoid_: Hint, answer

**Signal**:
A narrow, deliberate effect that crosses from one Room to the other as part of a Puzzle, such as a lamp that flickers on the other side. A puzzle mechanic, never a way to talk.
_Avoid_: Message, chat, ping, channel

**Draw**:
The set of Puzzles chosen for one attempt, together with the answers and Clues generated for them.
_Avoid_: Deal, run, seed
