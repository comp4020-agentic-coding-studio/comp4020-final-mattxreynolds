# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## Browser and restart checks

Install locked dependencies with `pnpm install --frozen-lockfile`, then install
Chromium with `pnpm exec playwright install chromium` (`--with-deps` on fresh
Linux). Build with `pnpm build`, start with `pnpm start`, and run `pnpm check`
in another terminal. `DATA_DIR` can point to a disposable directory for local
verification. Restart the production server after rebuilding its assets.

`browser.test.ts` opens separate Chromium contexts with independent storage;
it never treats two components or role tabs as two people. It checks visible
propagation within 1000ms from the actual outgoing command, recovery, isolated
rooms and delayed acknowledgements. Set `EVIDENCE_DIR` to an external directory
to capture screenshots and timings. `persistence.test.ts` uses isolated API
processes and temporary databases, removing them afterwards. Neither test
needs production credentials. Against a deployed older version, new-contract
checks will fail until that version is deployed.
