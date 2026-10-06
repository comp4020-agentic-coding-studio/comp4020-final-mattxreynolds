import { expect, it } from "vitest";
import * as G from "../shared/game.ts";

// Every generated device has to be fair: one answer per module, reachable
// from the manual. Checked over many random devices.
const devices = Array.from({ length: 2000 }, () => G.generateDevice());

it("gives every symbol lock exactly one matching manual column", () => {
  for (const d of devices) {
    const holding = G.SYMBOL_COLUMNS.filter((col) => d.symbols.every((s) => col.includes(s)));
    expect(holding).toHaveLength(1);
    expect(new Set(G.solveSymbols(d))).toEqual(new Set([0, 1, 2, 3]));
  }
});

it("always has a wire to cut, and a rule in the manual for that many wires", () => {
  for (const d of devices) {
    expect(G.WIRE_RULES[d.wires.length]).toBeDefined();
    const i = G.solveWires(d);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(d.wires.length);
  }
});

it("starts every switch panel at least two flips from the answer", () => {
  for (const d of devices) {
    const target = G.solveSwitches(d);
    expect(target.filter((up, i) => up !== d.switches.initial[i]).length).toBeGreaterThanOrEqual(2);
  }
});

it("resolves every keypad stage to a real key", () => {
  for (const d of devices) {
    const history: G.KeyPress[] = [];
    d.keypad.forEach((stage, s) => {
      const position = G.solveKeypad(stage, s, history);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(4);
      history.push({ position, label: stage.keys[position] });
    });
  }
});

it("makes every override pressable within ten seconds of any moment", () => {
  for (const d of devices.slice(0, 50)) {
    for (let ms = G.MISSION_MS; ms > 15_000; ms -= 7_000) {
      const ok = Array.from({ length: 11 }, (_, s) => G.overrideTimeOk(d, G.formatClock(ms - s * 1000)));
      expect(ok).toContain(true);
    }
  }
});
