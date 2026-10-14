// PreToolUse hook on Bash: anything that deploys asks the user first, even in
// auto mode. A deploy is a flyctl command that changes the app, a push to
// main, a merge into main (CI deploys every push to main), or a workflow
// dispatch. Prints nothing for every other command, so normal permissions
// decide.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const DEPLOY_BRANCHES = new Set(["main", "master"]);

// flyctl subcommands that only read
const FLY_READ_ONLY = new Set([
  "status", "logs", "version", "help", "doctor", "releases", "info",
  "auth", "apps list", "ips list", "volumes list", "machine list",
  "machines list", "config show", "checks list", "platform",
]);

type Input = { tool_input?: { command?: string }; cwd?: string };

const input: Input = JSON.parse(await new Response(process.stdin as unknown as ReadableStream).text());
const command = input.tool_input?.command ?? "";
const cwd = input.cwd ?? process.cwd();

// Rough shell split: segments on && || ; | and newlines, tokens on
// whitespace with quotes dropped. Good enough to find a deploy hiding in a
// compound command.
const segments = command
  .split(/&&|\|\||[;|\n]/)
  .map((s) => s.trim().split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, "")).filter(Boolean));

function run(cmd: string, args: string[]): string | undefined {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
  } catch {
    return undefined;
  }
}

function flyReason(tokens: string[]): string | undefined {
  const at = tokens.findIndex((t) => ["fly", "flyctl"].includes(basename(t)));
  if (at === -1) return undefined;
  const words = tokens.slice(at + 1).filter((t) => !t.startsWith("-"));
  const sub = words[0] ?? "";
  if (FLY_READ_ONLY.has(sub) || FLY_READ_ONLY.has(`${sub} ${words[1] ?? ""}`)) return undefined;
  return `flyctl ${sub || "(no subcommand)"} can change the deployed app`;
}

function pushReason(tokens: string[]): string | undefined {
  const at = tokens.indexOf("push");
  if (tokens[0] !== "git" || at === -1) return undefined;
  const args = tokens.slice(at + 1);
  if (args.some((a) => a === "--all" || a === "--mirror")) return "git push --all/--mirror includes main";
  if (args.includes("--delete") || args.includes("-d")) return undefined;
  const refspecs = args.filter((a) => !a.startsWith("-")).slice(1);
  for (const ref of refspecs) {
    const dest = ref.replace(/^\+/, "").split(":").pop()!.replace(/^refs\/heads\//, "");
    if (DEPLOY_BRANCHES.has(dest)) return `git push to ${dest} deploys via CI`;
  }
  if (refspecs.length === 0) {
    const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch && DEPLOY_BRANCHES.has(branch)) return `git push from ${branch} deploys via CI`;
  }
  return undefined;
}

function mergeReason(tokens: string[]): string | undefined {
  if (tokens[0] !== "gh" || tokens[1] !== "pr" || tokens[2] !== "merge") return undefined;
  const target = tokens.slice(3).find((t) => !t.startsWith("-"));
  const base = run("gh", ["pr", "view", ...(target ? [target] : []), "--json", "baseRefName", "-q", ".baseRefName"]);
  if (base === undefined) return "could not confirm this PR's base isn't main";
  if (DEPLOY_BRANCHES.has(base)) return `merging into ${base} deploys via CI`;
  return undefined;
}

function dispatchReason(tokens: string[]): string | undefined {
  if (tokens[0] !== "gh") return undefined;
  if (tokens[1] === "workflow" && tokens[2] === "run") return "gh workflow run can trigger the deploy job";
  if (tokens[1] === "api" && tokens.some((t) => /\/dispatches\b|\/merges?\b/.test(t))) {
    return "gh api call can dispatch a workflow or merge";
  }
  return undefined;
}

for (const tokens of segments) {
  const reason = flyReason(tokens) ?? pushReason(tokens) ?? mergeReason(tokens) ?? dispatchReason(tokens);
  if (reason) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Deploy guard: ${reason}. Deploys need the user's approval.`,
      },
    }));
    break;
  }
}
