## Branches

Integration branch until C10 (Wed 21 Oct): `c10/escape-room`.

- Branch from `origin/<integration branch>`; every PR targets it, never
  `main`. CI deploys every push to `main`.
- Once CI is green, merge your own PR with a merge commit
  (`gh pr merge <n> --merge`). Then delete the branch locally and on the
  remote, remove your worktree, and fast-forward the main checkout.
- `prototype/*` and `research/*` branches are evidence: push them, open no
  PR, and keep them on the remote only.
- GLOSSARY.md, `docs/adr/` and the map issue are edited by parallel sessions.
  Merge `origin/<integration branch>` and re-read them right before you write.
- Inside a worktree, run plain single commands with absolute paths; the
  isolation check refuses loops, `$VARS` and `git -C`.

## Deploys

Deploys always wait for the user's go-ahead. A deploy is any `flyctl`
command that changes the app, a push or merge to `main`, or a workflow run;
the deploy guard hook (`.claude/hooks/deploy-guard.ts`) asks before each one.

## Checks

- `pnpm test:unit`: the fast loop, with no app needed (`spec/**/*.unit.test.ts`).
- `pnpm check`: typecheck, then every test, including the app tests at
  `APP_URL` (default `http://localhost:8080`). Point it at a local app only;
  the live Fly app's log and Leaderboard are public.
- `pnpm exec playwright install --only-shell chromium` once before browser tests.

Coding rules for review live in `CODING_STANDARDS.md`.

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
