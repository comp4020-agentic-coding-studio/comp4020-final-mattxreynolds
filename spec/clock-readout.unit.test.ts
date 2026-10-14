// @vitest-environment jsdom
import { mount, unmount } from "svelte";
import { expect, test } from "vitest";
import ClockReadout from "../client/ClockReadout.svelte";

test("the Clock readout shows the time left as minutes and seconds", () => {
  const target = document.body.appendChild(document.createElement("div"));
  const app = mount(ClockReadout, { target, props: { secondsLeft: 754 } });
  expect(target.textContent).toContain("12:34");
  unmount(app);
});
