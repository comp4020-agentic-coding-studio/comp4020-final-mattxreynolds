import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Two projects, both under spec/. `app` runs against the running app, which
// spec/global-setup.ts finds. `unit` imports pure modules (the Puzzle
// registry, Room data, the source tree) and needs no app, so it runs alone
// as the fast loop: `pnpm test:unit`. `pnpm check` runs both.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: {
          name: "unit",
          include: ["spec/**/*.unit.test.ts"],
        },
      },
      {
        test: {
          name: "app",
          include: ["spec/**/*.test.ts"],
          exclude: ["spec/**/*.unit.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
    ],
  },
});
