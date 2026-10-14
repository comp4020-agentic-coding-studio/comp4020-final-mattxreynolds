#!/bin/sh
# Pipe-tests deploy-guard.ts: each case prints ASK or pass next to the command.
# Run from the repo root: sh .claude/hooks/deploy-guard-cases.sh
hook="$(dirname "$0")/deploy-guard.ts"
check() {
	out=$(jq -n --arg c "$1" '{tool_input:{command:$c},cwd:"."}' | node "$hook")
	case "$out" in *'"ask"'*) echo "ASK   $1" ;; *) echo "pass  $1" ;; esac
}
check "flyctl deploy --remote-only --ha=false -a comp4020-final-mattxreynolds"
check "cd /tmp && fly deploy"
check "mise exec -- flyctl secrets set X=1"
check "flyctl status -a comp4020-final-mattxreynolds"
check "flyctl logs"
check "flyctl apps list"
check "git push origin main"
check "git push origin HEAD:main"
check "git push --force origin feature:refs/heads/main"
check "git push -u origin chore/harness-before-c10"
check "git push origin --delete main-ideas"
check "git push --all"
check "gh workflow run checks.yml"
check "gh pr merge 20 --merge"
check "gh pr merge 36 --merge"
check "gh pr list --state open"
check "pnpm check"
