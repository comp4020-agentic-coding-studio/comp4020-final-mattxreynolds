// The game's rules, shared by the server (which generates devices and judges
// every action) and the client (which renders the Expert's manual from the
// same tables). A rule's manual text and its logic sit side by side so they
// can't drift apart unnoticed.

export const MODULES = ["wires", "symbols", "keypad", "switches", "override"] as const;
export type ModuleId = (typeof MODULES)[number];
export const MODULE_NAMES: Record<ModuleId, string> = {
  wires: "Wire array",
  symbols: "Symbol lock",
  keypad: "Memory keypad",
  switches: "Switch panel",
  override: "Override",
};

export const MISSION_MS = 5 * 60 * 1000;
export const MAX_STRIKES = 3;

export type WireColor = "red" | "blue" | "yellow" | "white" | "black";
export type LightColor = "green" | "red" | "blue" | "amber" | "off";
export type CasingColor = "green" | "red" | "blue" | "yellow";
export type OverrideLabel = "DISARM" | "ABORT" | "HOLD" | "DETONATE";

export interface KeypadStage {
  display: number; // 1-4
  keys: number[]; // labels 1-4, in position order
}

export interface Device {
  serial: string;
  wires: WireColor[];
  symbols: string[]; // in display order
  keypad: KeypadStage[];
  switches: { lights: LightColor[]; initial: boolean[] }; // true = up
  override: { casing: CasingColor; label: OverrideLabel };
}

const serialOdd = (serial: string): boolean => Number(serial.at(-1)) % 2 === 1;
const count = <T>(xs: T[], x: T): number => xs.filter((y) => y === x).length;

// ---- 01 Wire array -------------------------------------------------------

export const WIRE_RULES: Record<number, string[]> = {
  3: [
    "If there is no red wire, cut the second wire.",
    "Otherwise, if the last wire is white, cut the last wire.",
    "Otherwise, if there is a blue wire, cut the first blue wire.",
    "Otherwise, cut the first wire.",
  ],
  4: [
    "If there is more than one red wire and the serial number ends in an odd digit, cut the last red wire.",
    "Otherwise, if there are no yellow wires, cut the second wire.",
    "Otherwise, if there is exactly one white wire, cut the last wire.",
    "Otherwise, cut the first wire.",
  ],
  5: [
    "If the last wire is black, cut the fourth wire.",
    "Otherwise, if there is exactly one red wire and more than one yellow wire, cut the first wire.",
    "Otherwise, if there are no black wires, cut the second wire.",
    "Otherwise, cut the last wire.",
  ],
};

/** Index of the one wire to cut. */
export function solveWires(d: Device): number {
  const w = d.wires;
  const last = w.length - 1;
  if (w.length === 3) {
    if (!w.includes("red")) return 1;
    if (w[last] === "white") return last;
    if (w.includes("blue")) return w.indexOf("blue");
    return 0;
  }
  if (w.length === 4) {
    if (count(w, "red") > 1 && serialOdd(d.serial)) return w.lastIndexOf("red");
    if (!w.includes("yellow")) return 1;
    if (count(w, "white") === 1) return last;
    return 0;
  }
  if (w[last] === "black") return 3;
  if (count(w, "red") === 1 && count(w, "yellow") > 1) return 0;
  if (!w.includes("black")) return 1;
  return last;
}

// ---- 02 Symbol lock ------------------------------------------------------

export const SYMBOL_COLUMNS: string[][] = [
  ["△", "ϟ", "◎", "Ω", "Ψ", "★"],
  ["Ж", "△", "★", "☾", "λ", "¶"],
  ["◎", "Σ", "¶", "ϟ", "⊕", "Ѯ"],
  ["Ψ", "∞", "Ж", "Σ", "★", "◇"],
];

const columnsHolding = (symbols: string[]): string[][] =>
  SYMBOL_COLUMNS.filter((col) => symbols.every((s) => col.includes(s)));

/** Display indices of the symbols, in the order they must be pressed. */
export function solveSymbols(d: Device): number[] {
  const [col] = columnsHolding(d.symbols);
  return d.symbols
    .map((s, i) => ({ i, at: col.indexOf(s) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.i);
}

// ---- 03 Memory keypad ----------------------------------------------------

export type KeyRule =
  | { by: "position"; n: number }
  | { by: "label"; n: number }
  | { by: "samePosition"; stage: number }
  | { by: "sameLabel"; stage: number };

// KEYPAD_RULES[stage][display - 1]
export const KEYPAD_RULES: KeyRule[][] = [
  [
    { by: "position", n: 2 },
    { by: "position", n: 4 },
    { by: "position", n: 3 },
    { by: "position", n: 1 },
  ],
  [
    { by: "label", n: 4 },
    { by: "samePosition", stage: 1 },
    { by: "position", n: 1 },
    { by: "sameLabel", stage: 1 },
  ],
  [
    { by: "sameLabel", stage: 2 },
    { by: "samePosition", stage: 1 },
    { by: "position", n: 3 },
    { by: "label", n: 1 },
  ],
  [
    { by: "samePosition", stage: 1 },
    { by: "label", n: 2 },
    { by: "samePosition", stage: 2 },
    { by: "sameLabel", stage: 3 },
  ],
];

const ORDINAL = ["", "first", "second", "third", "fourth"];

export function keyRuleText(r: KeyRule): string {
  switch (r.by) {
    case "position":
      return `Press the key in the ${ORDINAL[r.n]} position.`;
    case "label":
      return `Press the key labelled ${r.n}.`;
    case "samePosition":
      return `Press the key in the same position you pressed in stage ${r.stage}.`;
    case "sameLabel":
      return `Press the key with the same label you pressed in stage ${r.stage}.`;
  }
}

export interface KeyPress {
  position: number; // 0-3
  label: number; // 1-4
}

/** Position (0-3) to press at `stage`, given the presses made so far. */
export function solveKeypad(stage: KeypadStage, stageIndex: number, history: KeyPress[]): number {
  const rule = KEYPAD_RULES[stageIndex][stage.display - 1];
  switch (rule.by) {
    case "position":
      return rule.n - 1;
    case "label":
      return stage.keys.indexOf(rule.n);
    case "samePosition":
      return history[rule.stage - 1].position;
    case "sameLabel":
      return stage.keys.indexOf(history[rule.stage - 1].label);
  }
}

// ---- 04 Switch panel -----------------------------------------------------

export const SWITCH_RULES: { light: LightColor; text: string }[] = [
  { light: "green", text: "Green light: the switch goes UP." },
  { light: "red", text: "Red light: the switch goes DOWN." },
  {
    light: "blue",
    text: "Blue light: the same position the switch to its left should be in. The leftmost switch goes UP.",
  },
  {
    light: "amber",
    text: "Amber light: the opposite of where the switch to its left should be. The leftmost switch goes DOWN.",
  },
  {
    light: "off",
    text: "No light: UP if the serial number ends in an even digit, otherwise DOWN.",
  },
];

/** Where each switch must be (true = up) before ENGAGE. */
export function solveSwitches(d: Device): boolean[] {
  const target: boolean[] = [];
  d.switches.lights.forEach((light, i) => {
    const left = i > 0 ? target[i - 1] : undefined;
    if (light === "green") target.push(true);
    else if (light === "red") target.push(false);
    else if (light === "blue") target.push(left ?? true);
    else if (light === "amber") target.push(left === undefined ? false : !left);
    else target.push(!serialOdd(d.serial));
  });
  return target;
}

// ---- 05 Override ---------------------------------------------------------

export const OVERRIDE_RULES: string[] = [
  "If the casing is green and the label says DISARM, press it at any time.",
  "Otherwise, if the casing is red, press it when the countdown shows a 1 in any position.",
  "Otherwise, if the label says HOLD, press it when the seconds end in 0 or 5.",
  "Otherwise, press it when the countdown shows a 4 in any position.",
];

/** Which OVERRIDE_RULES entry applies to this device. */
export function overrideRule(d: Device): number {
  const { casing, label } = d.override;
  if (casing === "green" && label === "DISARM") return 0;
  if (casing === "red") return 1;
  if (label === "HOLD") return 2;
  return 3;
}

/** Whether a countdown reading (as shown, "MM:SS") satisfies the override. */
export function overrideTimeOk(d: Device, clock: string): boolean {
  switch (overrideRule(d)) {
    case 0:
      return true;
    case 1:
      return clock.includes("1");
    case 2:
      return clock.endsWith("0") || clock.endsWith("5");
    default:
      return clock.includes("4");
  }
}

// ---- Shared helpers ------------------------------------------------------

/** The countdown as players see it: whole seconds, rounded up. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---- Device generation ---------------------------------------------------

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const WIRE_COLORS: WireColor[] = ["red", "blue", "yellow", "white", "black"];
const LIGHTS: LightColor[] = ["green", "red", "blue", "amber", "off"];
const CASINGS: CasingColor[] = ["green", "red", "blue", "yellow"];
const LABELS: OverrideLabel[] = ["DISARM", "ABORT", "HOLD", "DETONATE"];
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateSerial(): string {
  const digit = () => String(Math.floor(Math.random() * 10));
  return `${pick([...LETTERS])}${pick([...LETTERS])}${digit()}-${digit()}${digit()}${digit()}`;
}

function generateSymbols(): string[] {
  for (;;) {
    const col = pick(SYMBOL_COLUMNS);
    const chosen = shuffle(col).slice(0, 4);
    // exactly one column may hold all four, or the manual is ambiguous
    if (columnsHolding(chosen).length === 1) return chosen;
  }
}

export function generateKeypad(): KeypadStage[] {
  return KEYPAD_RULES.map(() => ({
    display: 1 + Math.floor(Math.random() * 4),
    keys: shuffle([1, 2, 3, 4]),
  }));
}

export function generateDevice(): Device {
  const serial = generateSerial();
  const wires = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => pick(WIRE_COLORS));
  const lights = Array.from({ length: 5 }, () => pick(LIGHTS));
  const device: Device = {
    serial,
    wires,
    symbols: generateSymbols(),
    keypad: generateKeypad(),
    switches: { lights, initial: [] },
    override: { casing: pick(CASINGS), label: pick(LABELS) },
  };
  // start at least two switches away from the answer, so there's work to do
  const target = solveSwitches(device);
  for (;;) {
    const initial = target.map(() => Math.random() < 0.5);
    if (initial.filter((up, i) => up !== target[i]).length >= 2) {
      device.switches.initial = initial;
      return device;
    }
  }
}
