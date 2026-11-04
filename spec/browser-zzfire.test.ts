import { afterAll, it, inject } from "vitest";
import { writeFileSync, appendFileSync } from "node:fs";
import { closeBrowser, createViaUi, joinViaLink, profile, skipIntro, use, viewOf, waitView } from "./helpers/browser.ts";
import { patch } from "./helpers/client.ts";
const baseUrl = inject("baseUrl");
const log = (...a: unknown[]) => appendFileSync("/tmp/perf/fire.log", a.join(" ") + "\n");
afterAll(() => closeBrowser());
it("fire, both seats, through the real controls", async () => {
  writeFileSync("/tmp/perf/fire.log", "");
  const a = await profile(baseUrl); const b = await profile(baseUrl); const E = a.page, N = b.page;
  const code = await createViaUi(a, "Ada"); await joinViaLink(b, code, "Lin");
  await E.getByTestId("ready").click(); await N.getByTestId("ready").click();
  await waitView(E, "v.phase === 'PROLOGUE'");
  await Promise.all([skipIntro(E), skipIntro(N)]);
  await patch(baseUrl, code, { phase: "RADIO", prologue: { busOn: true, acknowledged: true }, ship: { fire: { state: "burning", intensity: 20 } } });
  await waitView(E, "v.fire.state === 'burning'", 15000);
  await waitView(N, "v.fire.state === 'burning'", 15000);
  const e = await viewOf(E); const n = await viewOf(N);
  // secrecy: each seat only has its half
  log("E keys", Object.keys(e.fire).join(","), "N keys", Object.keys(n.fire).join(","));
  if ("compartment" in e.fire || "book" in e.fire) throw new Error("engineer sees the bridge half");
  if ("symptom" in n.fire) throw new Error("navigator sees the class");
  // "talk": Engineer reads symptom, Navigator finds the row
  const row = n.fire.book.find((r: any) => r.kind === e.fire.symptom);
  log("symptom", e.fire.symptom, "sequence", row.sequence.join(" "), "compartment", n.fire.compartment);
  for (const g of row.sequence) {
    const idx = e.fire.isolators.findIndex((i: any) => i.glyph === g);
    await use(E, `fire-isolator-${idx}`);
    await waitView(N, `v.fire.done >= 1 || v.fire.state === 'out'`, 3000);
  }
  await waitView(N, "v.fire.state === 'out'", 5000);
  await waitView(E, "v.fire.state === 'out'", 5000);
  log("fire out on both seats; E errors", JSON.stringify(a.errors), "N errors", JSON.stringify(b.errors));
  // look at both halves
  await E.evaluate(() => (window as any).__btwPose?.({ x: -7.4, z: 0.3, yaw: -1.57, pitch: 0 }));
  await N.evaluate(() => (window as any).__btwPose?.({ x: 7.2, z: -1.1, yaw: 1.57, pitch: 0 }));
  await E.addStyleTag({ content: ".overlay{display:none!important}" }); await N.addStyleTag({ content: ".overlay{display:none!important}" });
  await E.waitForTimeout(1500);
  await E.screenshot({ path: "/tmp/perf/fire-E.png" }); await N.screenshot({ path: "/tmp/perf/fire-N.png" });
}, 180000);
