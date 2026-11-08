// Pure canvas renderers for the Comms Room displays (distribution panel,
// evac accumulator dial, coast-station call rose) and its paper notices.
// Every state is spelled out in words or shapes as well as colour.

import { CASCADE, FINALE } from "../../../shared/config.ts";
import { BEARINGS, type Bearing } from "../../../shared/glyphs.ts";
import { CIRCUIT_LABEL, type Circuit } from "../../../shared/protocol.ts";
import { banner, type Ctx, fitText, header, INK, roundRect, screenBg, screenGlass, text } from "./draw.ts";

/** The ship's invented identity, kept consistent across every notice. */
export const SHIP = {
  name: "MV KESTREL MERIDIAN",
  operator: "HALVARD COASTAL LINES",
  port: "PORT OF REGISTRY: SKARHOLM",
  callsign: "CALL SIGN K7MR",
} as const;

// ------------------------------------------------------------ distribution

export type DistData = {
  draw: Record<Circuit | "PUMPS" | "DAVITS", number>;
  circuits: Record<Circuit, boolean>;
  pumpsOn: number;
  armed: boolean;
  gridDown: boolean;
  /** the act's systems exist yet (EVAC charges from Act IV) */
  evacInService: boolean;
};

type Row = { key: Circuit | "PUMPS" | "DAVITS"; label: string; state: string; on: boolean; where: string };

export function drawDistribution(ctx: Ctx, w: number, h: number, d: DistData): void {
  screenBg(ctx, w, h);
  header(ctx, w, "DISTRIBUTION · EMERGENCY SWITCHBOARD", d.gridDown ? "NO SUPPLY" : "SUPPLY LIVE", { color: d.gridDown ? INK.red : INK.ink });
  const rows: Row[] = [
    { key: "PUMPS", label: "BILGE PUMPS", state: `${d.pumpsOn} RUNNING`, on: d.pumpsOn > 0, where: "SWITCHED AT DAMAGE CONTROL" },
    { key: "LIGHTS", label: CIRCUIT_LABEL.LIGHTS, state: d.circuits.LIGHTS ? "ON" : "OFF", on: d.circuits.LIGHTS, where: "SWITCH 1 BELOW" },
    { key: "RADIO", label: CIRCUIT_LABEL.RADIO, state: d.circuits.RADIO ? "ON" : "OFF", on: d.circuits.RADIO, where: "SWITCH 2 · 3 WHILE CALLING" },
    {
      key: "EVAC",
      label: CIRCUIT_LABEL.EVAC,
      state: d.circuits.EVAC ? (d.evacInService ? "ON" : "ON · IDLE") : "OFF",
      on: d.circuits.EVAC,
      where: d.evacInService ? "SWITCH 3 · 4 CHARGING, 1 FULL" : "SWITCH 3 · IN SERVICE ACT IV",
    },
    { key: "DAVITS", label: "LIFEBOAT DAVITS", state: d.armed ? "ARMED" : "SAFE", on: d.armed, where: "ARMED FROM THE EVAC PANEL" },
  ];
  const x0 = 34;
  const top = 96;
  const rh = 72;
  text(ctx, "CIRCUIT", x0, top - 14, 22, INK.dim, "left");
  text(ctx, "STATE", 520, top - 14, 22, INK.dim, "center");
  text(ctx, "DRAW (UNITS)", 800, top - 14, 22, INK.dim, "center");
  rows.forEach((r, i) => {
    const y = top + 14 + i * rh;
    roundRect(ctx, x0 - 10, y, w - 2 * x0 + 20, rh - 10, 8);
    ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.22)" : "rgba(125,255,178,0.05)";
    ctx.fill();
    const cy = y + (rh - 10) / 2;
    fitText(ctx, r.label, x0 + 4, cy - 10, 30, 400, INK.white, "left");
    text(ctx, r.where, x0 + 4, cy + 18, 17, INK.dim, "left");
    // state: filled square ON, hollow OFF (shape as well as word)
    ctx.lineWidth = 3;
    ctx.strokeStyle = r.on ? INK.green : INK.dim;
    ctx.fillStyle = INK.green;
    if (r.on) ctx.fillRect(452, cy - 11, 22, 22);
    else ctx.strokeRect(453, cy - 10, 20, 20);
    text(ctx, r.state, 486, cy + 1, 26, r.on ? INK.green : INK.dim, "left");
    // draw as unit blocks plus the number
    const n = d.draw[r.key];
    for (let u = 0; u < 5; u++) {
      const bx = 690 + u * 34;
      if (u < n) {
        ctx.fillStyle = d.gridDown ? INK.dim : INK.ink;
        ctx.fillRect(bx, cy - 14, 26, 28);
      } else {
        ctx.strokeStyle = INK.faint;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 1, cy - 13, 24, 26);
      }
    }
    text(ctx, String(n), w - 40, cy + 1, 40, n > 0 ? INK.white : INK.dim, "right");
  });
  const total = d.draw.PUMPS + d.draw.LIGHTS + d.draw.RADIO + d.draw.EVAC + d.draw.DAVITS;
  const ty = top + 14 + rows.length * rh + 30;
  ctx.fillStyle = INK.ink;
  ctx.fillRect(x0, ty - 26, w - 2 * x0, 3);
  text(ctx, "TOTAL DRAW", x0 + 4, ty + 10, 36, INK.white, "left");
  text(ctx, `${total} UNITS`, w - 40, ty + 10, 44, INK.white, "right");
  if (d.gridDown) {
    banner(ctx, "NO SUPPLY — GENERATOR TRIPPED", w / 2, h - 52, w - 80, 70, INK.red);
  } else {
    text(ctx, "GENERATOR OUTPUT AND HEAT: ASK THE ENGINE ROOM", w / 2, h - 60, 24, INK.amber);
    text(ctx, "DRAW ABOVE OUTPUT OVERHEATS THE MACHINE — IT TRIPS", w / 2, h - 28, 20, INK.dim);
  }
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ evac accumulator

export type EvacData = {
  /** whole percent */
  evac: number;
  online: boolean;
  circuitOn: boolean;
  gridDown: boolean;
  armed: boolean;
  /** "before" Act IV, "live" in CASCADE/ESCAPE, "after" the voyage ended */
  stage: "before" | "live" | "after";
  escape: boolean;
};

export function evacStatus(d: EvacData): { word: string; color: string } {
  if (d.stage === "before") return { word: "NOT IN SERVICE", color: INK.dim };
  if (d.stage === "after") return { word: "SHUT DOWN", color: INK.dim };
  if (d.gridDown) return { word: "NO SUPPLY", color: INK.red };
  if (!d.circuitOn) return { word: d.escape && d.evac > 0 ? "CIRCUIT OFF · DRAINING" : "CIRCUIT OFF", color: INK.amber };
  if (d.evac >= 100) return { word: "FULL · HOLDING", color: INK.green };
  return { word: "▲ CHARGING", color: INK.ink };
}

export function drawEvac(ctx: Ctx, w: number, h: number, d: EvacData): void {
  screenBg(ctx, w, h, { grid: false });
  const st = evacStatus(d);
  header(ctx, w, "EVAC ACCUMULATOR", d.stage === "live" ? `${d.evac}%` : "STANDBY", { color: st.color });
  const cx = w / 2;
  const cy = h * 0.56;
  const r = Math.min(w, h) * 0.3;
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  const at = (p: number) => a0 + (span * p) / 100;
  // track
  ctx.lineCap = "butt";
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a0 + span);
  ctx.stroke();
  // fill
  const p = Math.max(0, Math.min(100, d.evac));
  if (p > 0) {
    ctx.strokeStyle = d.stage !== "live" ? INK.dim : p >= 100 ? INK.green : p >= FINALE.armCharge ? INK.ink : INK.amber;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, at(p));
    ctx.stroke();
  }
  // ticks every 10 %, labels every 25 %
  for (let t = 0; t <= 100; t += 10) {
    const a = at(t);
    const r0 = r + r * 0.13;
    const r1 = r + r * (t % 50 === 0 ? 0.24 : 0.18);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = t % 50 === 0 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
    if (t % 25 === 0 && t !== FINALE.armCharge) text(ctx, String(t), cx + Math.cos(a) * (r + r * 0.4), cy + Math.sin(a) * (r + r * 0.4), 26, INK.dim);
  }
  // the davits' arming line: a white notch + label (shape, not colour)
  const am = at(FINALE.armCharge);
  ctx.strokeStyle = INK.white;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(am) * (r - r * 0.14), cy + Math.sin(am) * (r - r * 0.14));
  ctx.lineTo(cx + Math.cos(am) * (r + r * 0.14), cy + Math.sin(am) * (r + r * 0.14));
  ctx.stroke();
  text(ctx, `${FINALE.armCharge} ▼ DAVITS`, cx + Math.cos(am) * (r + r * 0.42), cy + Math.sin(am) * (r + r * 0.42), 26, INK.white);
  // needle
  const an = at(p);
  ctx.strokeStyle = INK.white;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(an) * r * 0.82, cy + Math.sin(an) * r * 0.82);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = INK.white;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  // readout
  text(ctx, d.stage === "before" ? "—" : `${d.evac}%`, cx, cy + r * 0.42, r * 0.42, INK.white);
  fitText(ctx, st.word, cx, h - 70, 40, w - 60, st.color);
  text(ctx, d.armed ? "■ DAVITS ARMED" : "□ DAVITS NOT ARMED", cx, h - 26, 26, d.armed ? INK.green : INK.dim);
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ coast-station call

export type CallData = {
  stage: "before" | "live" | "after";
  call: { bearing: Bearing; remainingS: number } | null;
  answered: number;
  missed: number;
  radioOn: boolean;
  gridDown: boolean;
};

export function drawCall(ctx: Ctx, w: number, h: number, d: CallData): void {
  screenBg(ctx, w, h);
  const ringing = d.stage === "live" && d.call !== null;
  header(ctx, w, "COAST STATION · W/T CALL", ringing ? "INCOMING" : d.stage === "live" ? "LISTENING" : "STANDBY", { color: ringing ? INK.amber : INK.ink });
  // compass rose
  const cx = h * 0.5;
  const cy = h * 0.56;
  const r = h * 0.33;
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK.faint;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  BEARINGS.forEach((b, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const hit = ringing && d.call!.bearing === b;
    // a star point toward each bearing; the caller's is long, filled and boxed
    const len = hit ? r * 1.0 : i % 2 ? r * 0.55 : r * 0.8;
    const half = (hit ? 0.2 : 0.12) * r;
    const pa = a + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.lineTo(cx + Math.cos(pa) * half, cy + Math.sin(pa) * half);
    ctx.lineTo(cx - Math.cos(pa) * half, cy - Math.sin(pa) * half);
    ctx.closePath();
    if (hit) {
      ctx.fillStyle = INK.amber;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK.white;
      ctx.stroke();
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK.dim;
      ctx.stroke();
    }
    const lx = cx + Math.cos(a) * (r + 40);
    const ly = cy + Math.sin(a) * (r + 40);
    if (hit) {
      roundRect(ctx, lx - 40, ly - 24, 80, 48, 8);
      ctx.fillStyle = INK.white;
      ctx.fill();
      text(ctx, b, lx, ly + 2, 34, "#06150f");
    } else text(ctx, b, lx, ly + 2, 28, i % 2 ? INK.dim : INK.ink);
  });
  // right column
  const rx = h + (w - h) / 2 - 10;
  const cw = w - h - 20;
  if (d.stage === "before") {
    fitText(ctx, "NO TRAFFIC", rx, h * 0.42, 54, cw, INK.dim);
    fitText(ctx, "COAST STATIONS CALL IN ACT IV", rx, h * 0.56, 26, cw, INK.faint);
  } else if (d.stage === "after") {
    fitText(ctx, "NO MORE CALLS", rx, h * 0.4, 50, cw, INK.dim);
    fitText(ctx, "EACH ANSWERED CALL EASES THE ESCAPE", rx, h * 0.52, 24, cw, INK.faint);
  } else if (ringing) {
    const c = d.call!;
    text(ctx, "CALLER BEARING", rx, 120, 28, INK.dim);
    text(ctx, c.bearing, rx, 200, 110, INK.white);
    text(ctx, `${c.remainingS} s LEFT`, rx, 284, 46, c.remainingS <= 5 ? INK.red : INK.amber);
    const bw = cw - 40;
    roundRect(ctx, rx - bw / 2, 312, bw, 22, 6);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.fillStyle = INK.amber;
    ctx.fillRect(rx - bw / 2 + 3, 315, ((bw - 6) * Math.min(CASCADE.callWindowS, c.remainingS)) / CASCADE.callWindowS, 16);
    fitText(ctx, "1 · ENGINE ROOM AIMS ANTENNA", rx, 366, 24, cw, INK.ink);
    fitText(ctx, `2 · W/T RADIO CIRCUIT ${d.radioOn ? "ON ✓" : "OFF ✗"}`, rx, 398, 24, cw, d.radioOn ? INK.ink : INK.red);
    fitText(ctx, "3 · PRESS ANSWER", rx, 430, 24, cw, INK.ink);
  } else {
    fitText(ctx, "NO STATION CALLING", rx, h * 0.4, 44, cw, INK.dim);
    fitText(ctx, "KEEP THE W/T RADIO CIRCUIT ON", rx, h * 0.52, 26, cw, INK.faint);
  }
  fitText(ctx, `ANSWERED ${d.answered} · MISSED ${d.missed}`, rx, h - 30, 30, cw, INK.white);
  if (d.gridDown && d.stage === "live") banner(ctx, "RADIO DEAD — GENERATOR TRIPPED", w / 2, h * 0.56, w - 120, 70, INK.red);
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ paper notices

const PAPER = "#e9e1c9";
const PINK = "#22201b";

function paper(ctx: Ctx, w: number, h: number, title: string): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  // foxing and a water stain
  const g = ctx.createRadialGradient(w * 0.8, h * 0.85, 4, w * 0.8, h * 0.85, w * 0.35);
  g.addColorStop(0, "rgba(120,90,40,0.22)");
  g.addColorStop(1, "rgba(120,90,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PINK;
  ctx.fillRect(0, 0, w, 64);
  text(ctx, title, w / 2, 34, 32, PAPER);
}

export function drawRoster(ctx: Ctx, w: number, h: number): void {
  paper(ctx, w, h, "CREW LIST · WATCH BILL");
  text(ctx, `${SHIP.name} · ${SHIP.operator}`, w / 2, 96, 20, PINK);
  const crew: [string, string, string][] = [
    ["MASTER", "CAPT. I. VOSS", "BOAT 1"],
    ["CHIEF OFFICER", "R. OYELARAN", "BOAT 2"],
    ["RADIO OFFICER", "— ON WATCH —", "BRIDGE"],
    ["2ND OFFICER", "M. HALLORAN", "BOAT 1"],
    ["CHIEF ENGINEER", "T. BRANDT", "BOAT 2"],
    ["ENGINEER", "— ON WATCH —", "ENGINE RM"],
    ["BOSUN", "K. ESPINO", "BOAT 1"],
    ["COOK", "A. LINDQVIST", "BOAT 2"],
  ];
  crew.forEach(([rank, name, boat], i) => {
    const y = 140 + i * 44;
    text(ctx, rank, 30, y, 20, PINK, "left");
    text(ctx, name, w * 0.47, y, 20, PINK, "left", "normal");
    text(ctx, boat, w - 30, y, 20, PINK, "right");
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(24, y + 20, w - 48, 1);
  });
  text(ctx, "ALL HANDS: KNOW YOUR BOAT. MUSTER ON SEVEN SHORT, ONE LONG.", w / 2, h - 30, 16, PINK, "center", "normal");
}

export function drawMuster(ctx: Ctx, w: number, h: number): void {
  paper(ctx, w, h, "MUSTER STATIONS");
  // a plan of the boat deck: hull outline, two boats, arrows from the bridge
  const x0 = 50;
  const x1 = w - 50;
  const y0 = 120;
  const y1 = h - 90;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - 70, y0);
  ctx.quadraticCurveTo(x1, (y0 + y1) / 2, x1 - 70, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.stroke();
  // deckhouse
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 + 60, y0 + 50, 150, y1 - y0 - 100);
  text(ctx, "BRIDGE", x0 + 135, (y0 + y1) / 2 - 12, 18, PINK);
  text(ctx, "COMMS", x0 + 135, (y0 + y1) / 2 + 14, 16, PINK, "center", "normal");
  // boats: rounded rects with a number in a circle (shape + label)
  const boat = (cx: number, cy: number, n: string) => {
    roundRect(ctx, cx - 70, cy - 20, 140, 40, 20);
    ctx.fillStyle = "#d9c9a0";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = PINK;
    ctx.fill();
    text(ctx, n, cx, cy + 1, 18, PAPER);
  };
  boat(x0 + 340, y0 + 26, "1");
  boat(x0 + 340, y1 - 26, "2");
  // arrows
  ctx.lineWidth = 3;
  for (const [ty, label] of [[y0 + 26, "PORT"], [y1 - 26, "STBD"]] as const) {
    ctx.beginPath();
    ctx.moveTo(x0 + 210, (y0 + y1) / 2);
    ctx.lineTo(x0 + 262, ty);
    ctx.stroke();
    text(ctx, label, x0 + 470, ty, 16, PINK, "left");
  }
  text(ctx, "DAVITS ARMED FROM COMMS ROOM · EVAC ACCUMULATOR ≥ 50%", w / 2, h - 52, 17, PINK);
  text(ctx, "LOWER ONLY ON THE MASTER'S ORDER", w / 2, h - 26, 15, PINK, "center", "normal");
}

export function drawEmergencyCard(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#e0b31f";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = "#e9e1c9";
  ctx.fillRect(22, 22, w - 44, h - 44);
  text(ctx, "IN EMERGENCY", w / 2, 66, 40, "#1a1a1a");
  const lines = [
    "1  SEND THE DISTRESS CALL — RADIO DESK",
    "2  SHED LOAD YOU DO NOT NEED",
    "3  CHARGE THE EVAC ACCUMULATOR",
    "4  ANSWER COAST STATIONS PROMPTLY",
    "5  ARM DAVITS ≥ 50% CHARGE",
    "6  OPEN THE ESCAPE HATCH",
    "7  ABANDON SHIP TOGETHER",
  ];
  lines.forEach((l, i) => fitText(ctx, l, 44, 130 + i * 46, 22, w - 88, "#1a1a1a", "left"));
  text(ctx, "IF THE GENERATOR TRIPS: ENGINE ROOM RESETS IT", w / 2, h - 48, 17, "#7a1d14");
}

export function drawShipBoard(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#1d2328";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#b08d4a";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  text(ctx, SHIP.name, w / 2, h * 0.36, h * 0.3, "#efe6cf");
  fitText(ctx, `${SHIP.operator} · ${SHIP.port} · ${SHIP.callsign}`, w / 2, h * 0.74, h * 0.16, w - 60, "#b08d4a");
}
