import { expect, it } from "vitest";
import { url } from "./helpers.ts";

it.each([
  "/docs",
  "/docs/",
  "/docs/agents/issue-tracker.md",
  "/docs/agents/triage-labels.md",
  "/docs/agents/domain.md?raw",
])("keeps repository documentation off the public route %s", async (path) => {
  const res = await fetch(url(path));
  expect(res.status).toBe(404);
});
