# Dead Air: harness

> DRAFT written by the agent on 2026-10-06 for Matt to rewrite. These are the
> rules the first build session followed. Keep the ones you'd defend, cut or
> reword the rest.

## What this is

A two-seat cooperative defusal game (Keep Talking and Nobody Explodes, in the
Dead Air prototype's look). The Operator sees a randomised device, the Expert
sees the manual, and every finished run is written to a shared station log.

## Stack and commands

- Express server in TypeScript, run directly by Node 24 (type stripping, so no
  enums or other non-erasable syntax: `erasableSyntaxOnly` is on).
- React client built by Vite. In dev the server mounts Vite as middleware, so
  everything is on :8080, the same as production.
- SQLite via the built-in `node:sqlite`, one file in `DATA_DIR` (`/data` on
  Fly, `./data` locally). That's the only storage: no other DB, no files elsewhere.
- `pnpm dev` runs the app. `pnpm check` (typecheck + spec) runs against it.
  `pnpm build && pnpm start` is the production path the Dockerfile uses.

## Rules

1. **The server is the authority.** Clients send intents (`cut wire 2`), and
   only the server decides whether they were right. Never put a solution
   check in the client.
2. **The Expert's seat never receives device data**, over HTTP or the stream.
   `spec/game.test.ts` checks this. Don't weaken it.
3. **A rule's manual text and its logic live side by side in
   `shared/game.ts`.** Change both in the same commit. `spec/rules.test.ts`
   must keep passing over random devices: every module has exactly one answer
   and the manual can reach it.
4. **Every promise the README makes gets a check in `spec/`**, against the
   running app. If a check is impossible, say in the README that it's judged
   rather than enforced.
5. **Fit the Fly box**: one shared-cpu machine with 256 MB. No background
   workers or extra services.
6. **Look**: reuse the prototype's palette and type (lime `#befb70` for good,
   coral for bad, IBM Plex Mono / Barlow Condensed / Inter). Check UI changes at
   1440px and 390px wide with no horizontal scroll, and make sure everything is
   reachable by keyboard.
7. **Matt writes README.md, PROCESS.md and reflections/.** Don't draft them
   unless asked.
8. Commit small and often, with messages that say why.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues. Before tracker operations, read
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before triaging, read
`docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Before codebase exploration, read `docs/agents/domain.md`.
