# Issue tracker: GitHub

Issues and specs live in GitHub Issues for
`comp4020-agentic-coding-studio/comp4020-final-mattxreynolds`.
Use the `gh` CLI inside this clone; it infers the repo from the remote.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add appropriate label and state filters.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply/remove labels: `gh issue edit <number> --add-label "..."`
  or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

For multiline bodies, write the exact text to a temporary file and use
`--body-file`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child ticket: link to the map using GitHub sub-issues. If unavailable,
  add the child to a task list in the map and put `Part of #<map>`
  at the top of the child body.
- Label children `wayfinder:<type>`: research, prototype, grilling, or task.
- Blocking: use native GitHub issue dependencies. If unavailable, put
  `Blocked by: #<number>` at the top of the child body.
- Frontier: select the first open child in map order with no open
  blockers and no assignee.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the answer, close the ticket, and append
  a gist and link to the map's Decisions-so-far.
