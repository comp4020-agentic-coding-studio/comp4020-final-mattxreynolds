import { chromium } from "playwright";
import { expect, it } from "vitest";

// The permanent probe for ADR 0007: can Playwright's headless shell create a
// WebGL context? It needs no app (a data: page), so it sits with the unit
// project, and it runs in `pnpm check` and on the CI runner. If this goes red
// in CI, switch the browser checks to the runner's preinstalled Chrome
// (`channel: "chrome"`) and update the CI step and ADR 0007.
it("headless Chromium can create a WebGL context", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("data:text/html,<canvas id=c></canvas>");
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl");
      if (!gl) return null;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown renderer";
    });
    expect(renderer, "no WebGL context").not.toBeNull();
    console.log(`WebGL renderer: ${renderer}`);
  } finally {
    await browser.close();
  }
}, 60_000);
