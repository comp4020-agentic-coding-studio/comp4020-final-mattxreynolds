# A Person is a Guest or an Account, identified by a server-issued session cookie

The brief lets the app decide what counts as a person, and the marker plays alone in two Chrome profiles that share no cookies or storage. We decided a Person is either a Guest (created automatically on first visit, with a generated Player name) or an Account (username and password, no email), and that a Guest can become an Account in place, keeping the same public id and history. Either way the browser holds only a random secret token in an `httpOnly`, `SameSite=Lax`, year-long rolling cookie; the server maps it to a Person, and every Voyage, Team and log event is keyed by the Person's public id, never by the token.

## Considered Options

- **Header token from `localStorage`** (Dead Air's `x-player`): rejected because `EventSource` cannot set request headers, so SSE would need the token in the URL, where it leaks into logs and history.
- **Guests only**: rejected because the user wants Persons who can return from any browser. Guests and Accounts both ship at C10, with the person table keyed by public id so Accounts only add a credentials table.
- **Accounts only**: rejected because a showcase stranger or a marker with only the URL must be playing within a minute.

## Consequences

- One Person holds at most one Deck per Voyage, enforced on the server across tabs and browsers. Playing alone means a second Chrome profile or an incognito window.
- A Team is identified by its unordered pair of Persons, so clearing a Guest's cookies makes a new Person and a new Team.
- Because an incognito Guest loses its cookie overnight, each Voyage has a code its Players can enter in a fresh browser to rejoin a Deck whose Player isn't connected, which attaches that browser to the Deck's Person. The code is a bearer secret for that Voyage only.
- Logs carry the public id and Player name, never the token, a password or a Voyage code.
