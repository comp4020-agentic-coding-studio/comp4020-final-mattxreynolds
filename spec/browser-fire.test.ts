// Promise: the compartment fire (ADR 006) is playable through the real
// controls in two independent browser profiles. The Engineer's panel shows
// the class mark; the Bridge's card shows the procedure book; each page holds
// only its own half, and the Engineer throwing the Bridge's order puts the
// fire out on both seats.

import { afterAll, afterEach, expect, inject, it } from "vitest";
import { closeBrowser, createViaUi, joinViaLink, profile, skipIntro, use, viewOf, waitView, type Profile } from "./helpers/browser.ts";
import { patch, testHooks } from "./helpers/client.ts";

const baseUrl = inject("baseUrl");
let profiles: Profile[] = [];
afterEach(async () => {
  for (const p of profiles) await p.context.close().catch(() => {});
  profiles = [];
});
afterAll(async () => {
  await closeBrowser();
});

it.skipIf(!testHooks())("Engineer reads the mark, Bridge reads the order, the fire goes out on both seats", async () => {
  const a = await profile(baseUrl);
  const b = await profile(baseUrl);
  profiles.push(a, b);
  const E = a.page;
  const N = b.page;
  const code = await createViaUi(a, "Ada");
  await joinViaLink(b, code, "Lin");
  await E.getByTestId("ready").click();
  await N.getByTestId("ready").click();
  await waitView(E, "v.phase === 'PROLOGUE'");
  await Promise.all([skipIntro(E), skipIntro(N)]);
  // jump to Act III with the fire already burning (test hook)
  await patch(baseUrl, code, { phase: "RADIO", prologue: { busOn: true, acknowledged: true }, ship: { fire: { state: "burning", intensity: 20 } } });
  await waitView(E, "v.fire.state === 'burning'", 15000);
  await waitView(N, "v.fire.state === 'burning'", 15000);

  const e = await viewOf(E);
  const n = await viewOf(N);
  // each page holds only its half
  expect(e.fire.symptom).toBeTruthy();
  expect(e.fire).not.toHaveProperty("compartment");
  expect(e.fire).not.toHaveProperty("book");
  expect(n.fire).not.toHaveProperty("symptom");
  expect(n.fire.compartment).toBeTruthy();

  // what the crew says aloud: the mark, then the order from that row
  const row = n.fire.book.find((r: { kind: string }) => r.kind === e.fire.symptom);
  expect(row).toBeTruthy();
  for (const [step, glyph] of (row.sequence as string[]).entries()) {
    const idx = e.fire.isolators.findIndex((i: { glyph: string }) => i.glyph === glyph);
    await use(E, `fire-isolator-${idx}`);
    // the Bridge sees each step land, in real time
    await waitView(N, `v.fire.done >= ${step + 1} || v.fire.state === 'out'`, 2000);
  }
  await waitView(N, "v.fire.state === 'out'", 2000);
  await waitView(E, "v.fire.state === 'out'", 2000);
  expect(a.errors, a.errors.join("\n")).toEqual([]);
  expect(b.errors, b.errors.join("\n")).toEqual([]);
});
