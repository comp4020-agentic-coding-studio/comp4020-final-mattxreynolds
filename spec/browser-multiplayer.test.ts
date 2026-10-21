// The marker's walkthrough in two independent browser contexts: create, join
// by link, distinct roles, ready, a cross-room effect without reload, and a
// refresh that restores identity, role and state.

import { afterAll, describe, expect, inject, it } from "vitest";
import { closeBrowser, createViaUi, joinViaLink, profile, use, viewOf, waitView, type Profile } from "./helpers/browser.ts";

const baseUrl = inject("baseUrl");
const profiles: Profile[] = [];
afterAll(async () => {
  for (const p of profiles) await p.context.close();
  await closeBrowser();
});

describe("two browser profiles", () => {
  it("create → join → ready → cross-room effect → refresh restores the seat", async () => {
    const a = await profile(baseUrl);
    const b = await profile(baseUrl);
    profiles.push(a, b);

    const code = await createViaUi(a, "Ada");
    await joinViaLink(b, code, "Lin");

    // both lobbies show both callsigns, with different roles, without reload
    await a.page.locator('[data-role="NAVIGATOR"] .callsign', { hasText: "LIN" }).waitFor();
    await b.page.locator('[data-role="ENGINEER"] .callsign', { hasText: "ADA" }).waitFor();
    expect((await viewOf(a.page)).you).toBe("ENGINEER");
    expect((await viewOf(b.page)).you).toBe("NAVIGATOR");

    await a.page.getByTestId("ready").click();
    await b.page.locator('[data-role="ENGINEER"] .ready.yes').waitFor();
    await b.page.getByTestId("ready").click();
    await a.page.getByTestId("take-controls").waitFor();
    await b.page.getByTestId("take-controls").waitFor();

    // Engineer pulls the emergency bus lever; the Bridge sees power, no reload
    await use(a.page, "prologue-lever");
    await waitView(b.page, "v.prologue.busOn === true", 1500);

    // Navigator acknowledges; the Engineer moves to POWER
    await use(b.page, "prologue-ack");
    await waitView(a.page, "v.phase === 'POWER'", 1500);

    // refresh the Navigator: same role, same phase, no join screen
    await b.page.reload();
    await waitView(b.page, "v.phase === 'POWER' && v.you === 'NAVIGATOR'");
    await b.page.getByTestId("take-controls").waitFor();

    expect(a.errors, a.errors.join("\n")).toEqual([]);
    expect(b.errors, b.errors.join("\n")).toEqual([]);
  });

  it("a third profile is told the voyage is full", async () => {
    const a = await profile(baseUrl);
    const b = await profile(baseUrl);
    const c = await profile(baseUrl);
    profiles.push(a, b, c);
    const code = await createViaUi(a, "Ada");
    await joinViaLink(b, code, "Lin");
    await c.page.goto(`/v/${code}`);
    await c.page.getByText("already has two crew").waitFor();
    expect(await viewOf(c.page)).toBeNull();
  });
});
