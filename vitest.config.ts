import { defineConfig } from "vitest/config";

// Every test in spec/ runs with `pnpm check`. Two projects:
// - unit: pure logic (spec/**/*.unit.test.ts), no app needed — `pnpm test:unit`
// - app: against the running app, which spec/global-setup.ts finds (APP_URL)
export default defineConfig({
  test: {
    projects: [
      {
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
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
