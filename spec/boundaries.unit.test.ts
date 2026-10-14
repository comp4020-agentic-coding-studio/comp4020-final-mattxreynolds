import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ADR 0007: answers and checkers live only under server/, client/ imports
// only shared/, and shared/ imports neither. A relative import that crosses
// one of those lines fails here, before any payload test has to catch the
// leak at runtime.
const ALLOWED: Record<string, string[]> = {
  client: ["client", "shared"],
  shared: ["shared"],
  server: ["server", "shared"],
};

const SOURCE = /\.(ts|svelte|js)$/;

// static imports, re-exports, side-effect imports and dynamic import()
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

export function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[1]);
}

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules") return [];
    return statSync(path).isDirectory() ? files(path) : SOURCE.test(name) ? [path] : [];
  });
}

const root = resolve(import.meta.dirname, "..");

function violations(folder: string): string[] {
  const found: string[] = [];
  for (const file of files(join(root, folder))) {
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue; // packages are fine
      const target = relative(root, resolve(file, "..", spec)).split(sep)[0];
      if (target in ALLOWED && !ALLOWED[folder].includes(target)) {
        found.push(`${relative(root, file)} imports ${spec} (${folder}/ may import only ${ALLOWED[folder].join(", ")})`);
      }
    }
  }
  return found;
}

describe("import boundaries (ADR 0007)", () => {
  for (const folder of Object.keys(ALLOWED)) {
    it(`${folder}/ imports only ${ALLOWED[folder].join(" and ")}`, () => {
      expect(violations(folder)).toEqual([]);
    });
  }

  it("finds every import form", () => {
    const source = [
      `import { a } from "../server/a.ts";`,
      `import type { B } from '../shared/b.ts';`,
      `export * from "./c.ts";`,
      `import "./d.ts";`,
      `const e = await import("../server/e.ts");`,
    ].join("\n");
    expect(specifiers(source)).toEqual([
      "../server/a.ts",
      "../shared/b.ts",
      "./c.ts",
      "./d.ts",
      "../server/e.ts",
    ]);
  });
});
