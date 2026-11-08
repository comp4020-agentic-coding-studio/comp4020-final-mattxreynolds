import { defineConfig } from "vitest/config";

// Every test in spec/ runs with `pnpm check`. Two projects:
// - unit: pure logic (spec/**/*.unit.test.ts), no app needed — `pnpm test:unit`
// - app: against the running app, which spec/global-setup.ts finds (APP_URL)
// - browser: Playwright specs against the same app, one file at a time — two
//   software-rendered WebGL contexts per file is already plenty for one CPU
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
          exclude: ["spec/**/*.unit.test.ts", "spec/**/browser-*.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: "browser",
          include: ["spec/**/browser-*.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
          fileParallelism: false,
          // two room loads (up to ROOM_LOAD_MS each on a 4-core runner) plus play
          testTimeout: 180000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
