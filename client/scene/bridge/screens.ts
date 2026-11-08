// Pure canvas renderers for every Bridge display. Each takes exactly the data
// it shows (so callers can pass narrow redraw deps) and spells every state in
// words or shapes as well as colour.

import { RADIO } from "../../../shared/config.ts";
import { BEARINGS, COMPARTMENTS, COMPARTMENT_LABEL, type Bearing, type Compartment, type Glyph, type Pulse, type ShipSystem, pulseText } from "../../../shared/glyphs.ts";
import { ACT_TITLE, type Act, type NavigatorView } from "../../../shared/protocol.ts";
import {
  banner,
  type Ctx,
  fitText,
  font,
  hazardMark,
  header,
  INK,
  pulseDiagram,
  roundel,
  roundRect,
  screenBg,
  screenGlass,
  text,
  trendMark,
  TREND_WORD,
} from "./draw.ts";

export const mhz = (channel: number): string => (RADIO.mhzBase + channel * RADIO.mhzStep).toFixed(2);

// ------------------------------------------------------------ POWER

export type PowerData = Pick<NavigatorView["power"], "diagram" | "shorted" | "capacity" | "fed" | "tripped" | "online">;

const SYS_LABEL: Record<ShipSystem, string> = { PUMPS: "BILGE PUMPS", RADIO: "RADIO MAST", HELM: "HELM" };

export function drawPower(ctx: Ctx, w: number, h: number, d: PowerData): void {
  screenBg(ctx, w, h);
  header(ctx, w, "ROUTING DIAGRAM · EMERGENCY POWER", d.online ? "ONLINE" : d.tripped ? "TRIPPED" : `RATED ${d.capacity}`);

  // scorch and a torn corner (decoration, kept clear of content)
  const sc = ctx.createRadialGradient(w - 40, h - 30, 10, w - 40, h - 30, 230);
  sc.addColorStop(0, "rgba(0,0,0,0.85)");
  sc.addColorStop(0.4, "rgba(20,10,0,0.45)");
  sc.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sc;
  ctx.fillRect(w - 280, h - 260, 280, 260);
  ctx.fillStyle = "#15191b";
  ctx.beginPath();
  ctx.moveTo(w, h - 92);
  const jag = [[w - 14, h - 80], [w - 24, h - 66], [w - 40, h - 58], [w - 50, h - 40], [w - 66, h - 30], [w - 76, h - 12], [w - 96, h]];
  for (const [x, y] of jag) ctx.lineTo(x, y);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // a crack across the glass, top-left
  ctx.strokeStyle = "rgba(200,255,220,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.lineTo(28, 136);
  ctx.lineTo(44, 146);
  ctx.lineTo(70, 118);
  ctx.stroke();

  const rows = [168, 320, 472];
  const boxX = 36;
  const boxW = 300;
  const boxH = 112;
  const busX = 420;
  const feedX = [520, 680];
  const R = 52;

  d.diagram.forEach((row, i) => {
    const y = rows[i];
    const fed = d.fed[row.system];
    // system box
    roundRect(ctx, boxX, y - boxH / 2, boxW, boxH, 10);
    ctx.fillStyle = fed ? "rgba(57,211,107,0.18)" : "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = fed ? INK.green : INK.ink;
    ctx.stroke();
    text(ctx, SYS_LABEL[row.system], boxX + boxW / 2, y - 20, 34, INK.white);
    text(ctx, fed ? "● FED" : "○ NO FEED", boxX + boxW / 2, y + 26, 30, fed ? INK.green : INK.dim);

    // trunk from box to bus junction, then a branch to each feeder
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(boxX + boxW, y);
    ctx.lineTo(busX, y);
    ctx.moveTo(busX, y - 46);
    ctx.lineTo(busX, y + 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(busX, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = INK.ink;
    ctx.fill();
    text(ctx, "EITHER", (boxX + boxW + busX) / 2, y - 18, 20, INK.dim);

    row.feeders.forEach((g, j) => {
      const fx = feedX[j];
      const fy = y + (j === 0 ? -46 : 46);
      const shorted = g === d.shorted;
      ctx.strokeStyle = shorted ? INK.red : INK.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(busX, fy);
      if (shorted) {
        // a broken, zig-zag line into the shorted feeder
        const mid = (busX + fx - R) / 2;
        ctx.lineTo(mid - 20, fy);
        ctx.lineTo(mid - 8, fy - 14);
        ctx.lineTo(mid + 4, fy + 14);
        ctx.lineTo(mid + 16, fy);
        ctx.lineTo(fx - R, fy);
      } else {
        // breaker symbol: a gap with a hinged blade
        const bx = (busX + fx - R) / 2;
        ctx.lineTo(bx - 14, fy);
        ctx.moveTo(bx - 14, fy);
        ctx.lineTo(bx + 12, fy - 14);
        ctx.moveTo(bx + 14, fy);
        ctx.lineTo(fx - R, fy);
      }
      ctx.stroke();
      // the feeder roundel sits on the branch; feeders 0/1 stagger left/right
      const rx = fx + (j === 0 ? 0 : 0);
      roundel(ctx, g, rx, fy, R * 0.82, { ring: shorted ? INK.red : INK.ink });
      if (shorted) {
        // red dashed hazard ring + bolt triangle on the ring + stamp text
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK.red;
        ctx.beginPath();
        ctx.arc(rx, fy, R * 0.82 + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        hazardMark(ctx, rx + R * 0.82 + 4, fy - R * 0.62, 46);
        // stamp sits right of the whole roundel column (never over a neighbour's icon),
        // tied to its feeder by a dashed leader
        const sx = feedX[1] + R + 52;
        const sw = w - sx - 12;
        ctx.setLineDash([8, 7]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(rx + R * 0.82 + 14, fy);
        ctx.lineTo(sx, fy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.save();
        ctx.translate(sx, fy);
        roundRect(ctx, 0, -38, sw, 76, 6);
        ctx.fillStyle = "rgba(60,0,0,0.75)";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK.red;
        ctx.stroke();
        fitText(ctx, "⚡ SHORTED", sw / 2, -13, 32, sw - 16, "#ffd2cc");
        fitText(ctx, "DO NOT ENERGISE", sw / 2, 20, 28, sw - 16, "#ffd2cc");
        ctx.restore();
      }
    });
  });

  // footer status
  if (d.online) banner(ctx, "EMERGENCY POWER ONLINE", w / 2 - 40, h - 46, 620, 64, INK.green);
  else if (d.tripped) banner(ctx, "⚠ GENERATOR TRIPPED — RESETTING", w / 2 - 40, h - 46, 640, 64, INK.amber);
  else text(ctx, `ONE FEEDER EACH · NOT THE SHORTED ONE · TOTAL LOAD ≤ ${d.capacity}`, w / 2 - 50, h - 42, 24, INK.dim);
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ FLOOD

export type FloodData = {
  levels: Record<Compartment, number>;
  trends: Record<Compartment, -1 | 0 | 1>;
  running: number;
  /** "flood": Act II (hold to stabilise); "later": pumps still live (Acts III–V); "done": voyage over */
  stage: "flood" | "later" | "done";
  target: number;
  /** seconds all three have been held at or below the target, of holdS */
  held: number;
  holdS: number;
  breached: Record<Compartment, boolean>;
  lost: Record<Compartment, boolean>;
  dry: Record<Compartment, boolean>;
  gridDown: boolean;
};

/** A jagged crack icon (shape-coded breach marker). */
function crackMark(ctx: Ctx, cx: number, cy: number, s: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const pts = [[-1, -0.9], [-0.35, -0.35], [-0.6, 0.05], [0.05, 0.25], [-0.15, 0.6], [0.5, 0.95]];
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.lineWidth = Math.max(4, s * 0.22);
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "#111";
  ctx.stroke();
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.strokeStyle = color;
  ctx.stroke();
  // spray ticks from the crack
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[-0.35, -0.35, 0.45, -0.25], [0.05, 0.25, 0.5, 0.0], [-0.6, 0.05, -0.45, 0.1]]) {
    ctx.moveTo(x * s, y * s);
    ctx.lineTo((x + dx) * s, (y + dy) * s);
  }
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.stroke();
  ctx.restore();
}

export function drawFlood(ctx: Ctx, w: number, h: number, d: FloodData): void {
  screenBg(ctx, w, h);
  header(ctx, w, "DAMAGE CONTROL · FLOODING", d.stage === "done" ? "SECURED" : d.gridDown ? "NO SUPPLY" : `PUMP BUS ${d.running}/2`, { color: d.gridDown ? INK.red : INK.ink });

  // hull side elevation, bow to the right
  const x0 = 60;
  const x1 = w - 40;
  const top = 120;
  const keel = 500;
  const hull = new Path2D();
  hull.moveTo(x0, top);
  hull.lineTo(x1 - 40, top);
  hull.lineTo(x1, top - 18); // raked stem
  hull.quadraticCurveTo(x1 - 60, keel - 40, x1 - 200, keel);
  hull.lineTo(x0 + 50, keel);
  hull.quadraticCurveTo(x0, keel - 10, x0, keel - 90); // stern
  hull.closePath();

  // compartments: ENGINE BAY aft (left), CARGO mid, FORE HOLD fwd (right)
  const order: Compartment[] = ["ENGINE", "CARGO", "FORE"];
  const bulk = [x0, x0 + 300, x0 + 600, x1];
  ctx.save();
  ctx.clip(hull);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x0, top - 20, x1 - x0, keel - top + 20);
  order.forEach((c, i) => {
    const level = d.lost[c] ? 100 : Math.max(0, Math.min(100, d.levels[c]));
    const y = keel - ((keel - top) * level) / 100;
    const wg = ctx.createLinearGradient(0, y, 0, keel);
    wg.addColorStop(0, "rgba(127,214,240,0.85)");
    wg.addColorStop(1, "rgba(30,90,120,0.9)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(bulk[i], keel + 10);
    ctx.lineTo(bulk[i], y);
    for (let x = bulk[i]; x <= bulk[i + 1]; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.07) * 4);
    ctx.lineTo(bulk[i + 1], keel + 10);
    ctx.closePath();
    ctx.fill();
    if (d.lost[c]) {
      // a lost compartment: dark wash + diagonal hatching (pattern, not colour)
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bulk[i], top - 20, bulk[i + 1] - bulk[i], keel - top + 30);
      ctx.strokeStyle = "rgba(255,68,54,0.75)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = bulk[i] - (keel - top); x < bulk[i + 1]; x += 34) {
        ctx.moveTo(x, keel + 10);
        ctx.lineTo(x + (keel - top) + 30, top - 20);
      }
      ctx.stroke();
    }
  });
  // target line at 20 %
  const ty = keel - ((keel - top) * d.target) / 100;
  ctx.setLineDash([16, 10]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK.amber;
  ctx.beginPath();
  ctx.moveTo(x0, ty);
  ctx.lineTo(x1, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // hull outline + bulkheads
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK.ink;
  ctx.stroke(hull);
  ctx.lineWidth = 5;
  for (const x of bulk.slice(1, 3)) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, keel);
    ctx.stroke();
  }
  // deckhouse silhouette
  ctx.fillStyle = "rgba(125,255,178,0.18)";
  ctx.fillRect(x0 + 40, top - 46, 150, 46);
  ctx.strokeRect(x0 + 40, top - 46, 150, 46);

  // labels per compartment
  order.forEach((c, i) => {
    const cx = (bulk[i] + bulk[i + 1]) / 2 - (i === 2 ? 40 : 0);
    const level = Math.round(d.levels[c]);
    const ok = level <= d.target;
    text(ctx, COMPARTMENT_LABEL[c], cx, top + 34, 32, INK.white);
    if (d.lost[c]) {
      banner(ctx, "LOST", cx, top + 116, 200, 92, INK.red);
      text(ctx, "FLOODED · SEALED", cx, top + 208, 24, INK.red);
      if (d.breached[c]) text(ctx, "BREACHED", cx, top + 240, 22, INK.dim);
      return;
    }
    // number plate so it reads over water
    roundRect(ctx, cx - 92, top + 70, 184, 92, 10);
    ctx.fillStyle = "rgba(4,16,12,0.82)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? INK.green : INK.ink;
    ctx.stroke();
    text(ctx, `${level}%`, cx, top + 117, 64, ok ? INK.green : INK.white);
    const tr = d.trends[c];
    roundRect(ctx, cx - 110, top + 180, 220, 56, 10);
    ctx.fillStyle = "rgba(4,16,12,0.82)";
    ctx.fill();
    trendMark(ctx, tr, cx - 76, top + 208, 34);
    text(ctx, TREND_WORD[tr], cx + 20, top + 209, 30, tr > 0 ? INK.amber : tr < 0 ? INK.green : INK.dim);
    if (d.breached[c]) {
      // breach: crack icon + label on a dark plate, low in the compartment
      roundRect(ctx, cx - 118, top + 250, 236, 62, 10);
      ctx.fillStyle = "rgba(40,6,4,0.9)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK.red;
      ctx.stroke();
      crackMark(ctx, cx - 80, top + 281, 24, INK.red);
      text(ctx, "BREACH", cx + 22, top + 282, 38, INK.red);
    }
    if (d.dry[c]) {
      roundRect(ctx, cx - 130, keel - 58, 260, 50, 8);
      ctx.fillStyle = INK.amber;
      ctx.fill();
      text(ctx, "⚠ RUNNING DRY", cx, keel - 32, 30, "#111");
    } else if (ok) text(ctx, "✓ BELOW TARGET", cx, keel - 30, 22, INK.green);
  });
  // target legend above the hull (kept clear of the per-compartment plates)
  ctx.setLineDash([16, 10]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK.amber;
  ctx.beginPath();
  ctx.moveTo(x0 + 215, top - 24);
  ctx.lineTo(x0 + 285, top - 24);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, `TARGET ${d.target}%`, x0 + 298, top - 23, 24, INK.amber, "left");

  const anyDry = COMPARTMENTS.some((c) => d.dry[c]);
  if (d.stage === "done") banner(ctx, "DAMAGE CONTROL SECURED", w / 2, h - 62, 640, 70, INK.dim);
  else if (d.gridDown) banner(ctx, "NO SUPPLY — PUMPS STOPPED · GENERATOR TRIPPED", w / 2, h - 62, w - 80, 70, INK.red);
  else if (anyDry) {
    text(ctx, "A PUMP IS DRAWING ON AN EMPTY COMPARTMENT — IT WILL SEIZE", w / 2, h - 82, 24, INK.amber);
    text(ctx, "TELL THE ENGINE ROOM TO SHUT THAT VALVE, OR STOP THE PUMP", w / 2, h - 44, 24, INK.amber);
  } else if (d.stage === "flood") {
    // hold progress: all three at or below the line for holdS seconds
    const held = Math.max(0, Math.min(d.holdS, d.held));
    const bx = 70;
    const bw = 520;
    const by = h - 92;
    text(ctx, `HOLD ${held.toFixed(1)} / ${d.holdS} s`, bx, by - 2, 26, held > 0 ? INK.green : INK.dim, "left");
    roundRect(ctx, bx, by + 18, bw, 34, 6);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.ink;
    ctx.stroke();
    ctx.fillStyle = INK.green;
    ctx.fillRect(bx + 4, by + 22, ((bw - 8) * held) / d.holdS, 26);
    for (let i = 1; i < d.holdS; i++) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx + (bw * i) / d.holdS - 1, by + 18, 2, 34);
    }
    text(ctx, "ALL THREE BELOW THE LINE AT ONCE", bx + bw + 30, by - 2, 22, INK.dim, "left");
    text(ctx, `PUMPS RUNNING ${d.running} · BUS MAX 2`, bx + bw + 30, by + 36, 26, d.running >= 2 ? INK.amber : INK.ink, "left");
  } else {
    text(ctx, "HULL SHORED · PUMPS STILL LIVE — KEEP THE WATER DOWN", w / 2, h - 82, 24, INK.dim);
    text(ctx, `PUMPS RUNNING ${d.running} · BUS MAX 2 · FOLLOW THE BREACHES`, w / 2, h - 44, 26, d.running >= 2 ? INK.amber : INK.ink);
  }
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ RADIO: tuner

export function drawTuner(ctx: Ctx, w: number, h: number, channel: number, coupled: boolean): void {
  screenBg(ctx, w, h);
  header(ctx, w, "TUNER", coupled ? "CARRIER LOCKED" : `CH ${String(channel).padStart(2, "0")} / ${RADIO.channels - 1}`);
  // big frequency readout
  ctx.font = font(170);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = coupled ? INK.green : INK.white;
  ctx.shadowColor = coupled ? INK.green : INK.ink;
  ctx.shadowBlur = 18;
  ctx.fillText(mhz(channel), w / 2 - 70, 190);
  ctx.shadowBlur = 0;
  text(ctx, "MHz", w / 2 + 300, 210, 64, INK.ink);

  // band scale: every channel a tick, label every 4
  const sx0 = 70;
  const sx1 = w - 70;
  const sy = 400;
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx0, sy);
  ctx.lineTo(sx1, sy);
  ctx.stroke();
  for (let c = 0; c < RADIO.channels; c++) {
    const x = sx0 + ((sx1 - sx0) * c) / (RADIO.channels - 1);
    const major = c % 4 === 0;
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x, sy - (major ? 34 : 18));
    ctx.stroke();
    if (major) text(ctx, mhz(c), x, sy + 30, 24, INK.dim);
  }
  const nx = sx0 + ((sx1 - sx0) * channel) / (RADIO.channels - 1);
  ctx.fillStyle = coupled ? INK.green : INK.amber;
  ctx.beginPath();
  ctx.moveTo(nx, sy + 4);
  ctx.lineTo(nx - 16, sy - 54);
  ctx.lineTo(nx + 16, sy - 54);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(nx - 3, sy - 70, 6, 80);

  if (coupled) banner(ctx, "CARRIER LOCKED · TUNING FIXED", w / 2, h - 90, 760, 76, INK.green);
  else {
    text(ctx, "◄ TUNE DOWN      TUNE UP ►", w / 2, h - 110, 34, INK.ink);
    text(ctx, "NO RESONANCE READING HERE — ASK THE ENGINE ROOM", w / 2, h - 60, 24, INK.dim);
  }
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ RADIO: waveform (animated)

export function drawWave(ctx: Ctx, w: number, h: number, coupled: boolean, t: number, standby: boolean): void {
  screenBg(ctx, w, h, { grid: true });
  header(ctx, w, "RECEIVER", standby ? "STANDBY" : coupled ? "CARRIER" : "STATIC", { h: 52 });
  const mid = h / 2 + 24;
  ctx.strokeStyle = INK.faint;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  if (standby) {
    text(ctx, "STANDBY", w / 2, mid, 64, INK.dim);
    screenGlass(ctx, w, h);
    return;
  }
  ctx.lineWidth = 5;
  ctx.strokeStyle = coupled ? INK.green : INK.ink;
  ctx.beginPath();
  const amp = h * 0.26;
  for (let x = 0; x <= w; x += coupled ? 4 : 6) {
    const y = coupled
      ? mid + Math.sin(x * 0.045 - t * 9) * amp
      : mid + (Math.random() - 0.5) * amp * 1.6 * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.013 + t * 3)));
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (!coupled) {
    // speckle
    ctx.fillStyle = "rgba(200,255,220,0.35)";
    for (let i = 0; i < 160; i++) ctx.fillRect(Math.random() * w, 52 + Math.random() * (h - 52), 3, 3);
  }
  text(ctx, coupled ? "CLEAN CARRIER" : "NO CARRIER — STATIC", w / 2, h - 34, 34, coupled ? INK.green : INK.dim);
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ RADIO: signal meter

export function drawSignal(ctx: Ctx, w: number, h: number, signal: number, live: boolean): void {
  // cream analogue meter face
  ctx.fillStyle = INK.cream;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK.dark;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  const cx = w / 2;
  const cy = h * 0.86;
  const R = w * 0.4;
  const a0 = Math.PI * 1.15;
  const a1 = Math.PI * 1.85;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, a0, a1);
  ctx.stroke();
  // strong zone band (shape: thick arc segment)
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#3d7d4f";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 14, a0 + (a1 - a0) * 0.75, a1);
  ctx.stroke();
  ctx.strokeStyle = INK.dark;
  ctx.lineWidth = 4;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    const l = i % 5 === 0 ? 30 : 16;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l));
    ctx.stroke();
    if (i % 5 === 0) text(ctx, String(i / 10 === 1 ? "MAX" : i * 10), cx + Math.cos(a) * (R + 30), cy + Math.sin(a) * (R + 30), 26, INK.dark);
  }
  text(ctx, "SIGNAL", cx, h * 0.14, 46, INK.dark);
  const s = live ? Math.max(0, Math.min(1, signal)) : 0;
  const word = !live ? "NO CARRIER" : s >= 0.75 ? "STRONG" : s > 0.05 ? "WEAK" : "NONE";
  text(ctx, word, cx, cy - R * 0.42, 34, INK.dark);
  // needle
  const a = a0 + (a1 - a0) * s;
  ctx.strokeStyle = "#a3271d";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10));
  ctx.stroke();
  ctx.fillStyle = INK.dark;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------ RADIO: reply

export const REPLY_TEXT: Record<"contact" | "wrong-station" | "no-carrier", string> = {
  contact: "SHORE STATION: MESSAGE RECEIVED — RESCUE INBOUND",
  "wrong-station": "STATION REPLIES: CANNOT ASSIST — WRONG STATION",
  "no-carrier": "NO CARRIER — NOTHING ON THAT BEARING",
};

export function drawReply(ctx: Ctx, w: number, h: number, reply: NavigatorView["radio"]["lastReply"], coupled: boolean): void {
  screenBg(ctx, w, h, { grid: false });
  ctx.fillStyle = "rgba(125,255,178,0.12)";
  ctx.fillRect(0, 0, 210, h);
  text(ctx, "REPLY", 105, h / 2, 44, INK.ink);
  const color = reply === "contact" ? INK.green : reply ? INK.amber : INK.dim;
  const s = reply ? REPLY_TEXT[reply] : coupled ? "— AWAITING TRANSMISSION —" : "—";
  fitText(ctx, s, (w + 210) / 2, h / 2, 46, w - 250, color);
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ chart + codebook (paper)

const PAPER = "#ece2c6";
const PAPER_INK = "#1d2a3a";

function paper(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  // foxing / stains
  for (const [x, y, r] of [[0.15, 0.2, 0.12], [0.85, 0.75, 0.16], [0.7, 0.1, 0.08]]) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, "rgba(140,110,60,0.12)");
    g.addColorStop(1, "rgba(140,110,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.strokeStyle = PAPER_INK;
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
}

export type StationData = { glyph: Glyph; pattern: Pulse; bearing: Bearing }[];

export function drawChart(ctx: Ctx, w: number, h: number, stations: StationData, issued: boolean): void {
  paper(ctx, w, h);
  const cx = w / 2;
  const cy = h / 2 + 30;
  const R = Math.min(w, h) * 0.37;
  text(ctx, "SHORE STATIONS · BEARING FROM SHIP", cx, 62, 38, PAPER_INK);
  // range rings
  ctx.strokeStyle = "rgba(29,42,58,0.35)";
  ctx.lineWidth = 2;
  for (const k of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  // rays + compass labels for all 8 points
  BEARINGS.forEach((b, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    ctx.setLineDash(i % 2 ? [6, 10] : []);
    ctx.strokeStyle = "rgba(29,42,58,0.5)";
    ctx.lineWidth = i % 2 ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
    ctx.setLineDash([]);
    const lr = R + 40;
    text(ctx, b, cx + Math.cos(a) * lr, cy + Math.sin(a) * lr, i % 2 ? 46 : 60, PAPER_INK);
  });
  // north arrow
  ctx.fillStyle = PAPER_INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R - 2);
  ctx.lineTo(cx - 14, cy - R + 30);
  ctx.lineTo(cx + 14, cy - R + 30);
  ctx.closePath();
  ctx.fill();
  // compass rose centre with the ship
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(i % 2 ? 7 : 10, -(i % 2 ? 30 : 52));
    ctx.lineTo(0, -(i % 2 ? 36 : 60));
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "rgba(29,42,58,0.4)" : "rgba(29,42,58,0.75)";
    ctx.fill();
  }
  ctx.restore();
  // ship silhouette (bow north)
  ctx.fillStyle = "#a3271d";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26);
  ctx.quadraticCurveTo(cx + 13, cy - 8, cx + 11, cy + 22);
  ctx.lineTo(cx - 11, cy + 22);
  ctx.quadraticCurveTo(cx - 13, cy - 8, cx, cy - 26);
  ctx.fill();
  text(ctx, "YOU", cx + 38, cy + 30, 22, "#a3271d");

  if (!issued) {
    roundRect(ctx, cx - 300, cy + R * 0.45, 600, 90, 8);
    ctx.fillStyle = "rgba(236,226,198,0.94)";
    ctx.fill();
    ctx.strokeStyle = PAPER_INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, "STATIONS PLOTTED WHEN", cx, cy + R * 0.45 + 30, 28, PAPER_INK);
    text(ctx, "THE RADIO HAS POWER", cx, cy + R * 0.45 + 62, 28, PAPER_INK);
    return;
  }
  stations.forEach((s) => {
    const i = BEARINGS.indexOf(s.bearing);
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const r = R * 0.7;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.strokeStyle = PAPER_INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
    ctx.lineTo(cx + Math.cos(a) * (r - 64), cy + Math.sin(a) * (r - 64));
    ctx.stroke();
    // radio mast tick marks
    roundel(ctx, s.glyph, x, y, 58, { bg: "#fffaf0", ring: PAPER_INK, ink: PAPER_INK });
  });
}

/** Codebook entries, ordered by pattern length then shape (not by bearing),
 * so the codebook and the chart are separate lookups. */
export function codebookOrder(stations: StationData): StationData {
  return [...stations].sort(
    (a, b) => a.pattern.length - b.pattern.length || pulseText(a.pattern).localeCompare(pulseText(b.pattern)),
  );
}

export function drawCodebook(ctx: Ctx, w: number, h: number, stations: StationData, issued: boolean): void {
  paper(ctx, w, h);
  text(ctx, "CODEBOOK · STATION CALL PULSES", w / 2, 64, 44, PAPER_INK);
  // legend
  pulseDiagram(ctx, [true], 70, 118, 24, PAPER_INK);
  text(ctx, "LONG", 160, 119, 28, PAPER_INK, "left");
  pulseDiagram(ctx, [false], 290, 118, 24, PAPER_INK);
  text(ctx, "SHORT", 330, 119, 28, PAPER_INK, "left");
  text(ctx, "MATCH THE ENGINE ROOM'S PULSE LAMP", w - 60, 119, 24, "rgba(29,42,58,0.7)", "right");
  ctx.fillStyle = PAPER_INK;
  ctx.fillRect(40, 146, w - 80, 3);
  if (!issued) {
    text(ctx, "SEALED UNTIL THE RADIO HAS POWER", w / 2, h / 2 + 60, 40, "rgba(29,42,58,0.6)");
    return;
  }
  const list = codebookOrder(stations);
  // two columns: 3 + 2
  const colW = (w - 100) / 2;
  const rowH = (h - 190) / 3;
  list.forEach((s, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x = 50 + col * colW;
    const y = 170 + row * rowH;
    const cy = y + rowH / 2;
    if (row > 0) {
      ctx.strokeStyle = "rgba(29,42,58,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10, y);
      ctx.lineTo(x + colW - 20, y);
      ctx.stroke();
    }
    roundel(ctx, s.glyph, x + 70, cy, Math.min(56, rowH * 0.36), { bg: "#fffaf0", ring: PAPER_INK, ink: PAPER_INK });
    pulseDiagram(ctx, s.pattern, x + 150, cy - 14, 36, PAPER_INK);
    text(ctx, pulseText(s.pattern), x + 150, cy + 38, 30, "rgba(29,42,58,0.75)", "left");
  });
  if (list.length === 5) {
    // the empty sixth cell carries a note
    const x = 50 + colW;
    const y = 170 + 2 * rowH;
    text(ctx, "LISTED BY PATTERN LENGTH", x + colW / 2, y + rowH / 2 - 14, 24, "rgba(29,42,58,0.6)");
    text(ctx, "BEARINGS: SEE CHART TABLE", x + colW / 2, y + rowH / 2 + 20, 24, "rgba(29,42,58,0.6)");
  }
}

// ------------------------------------------------------------ ESCAPE

export type EscapeData = Pick<NavigatorView["escape"], "band" | "status" | "door" | "held" | "youAbandon" | "partnerAbandon">;

export function drawEscape(ctx: Ctx, w: number, h: number, d: EscapeData): void {
  screenBg(ctx, w, h);
  header(ctx, w, "DOOR RAMS · ESCAPE HATCH", d.door >= 100 ? "DOOR OPEN" : d.held ? "RELEASE HELD" : "RELEASE OFF");
  const [lo, hi] = d.band;
  text(ctx, `RAMS REQUIRE ${lo}–${hi}`, w / 2, 130, 66, INK.white);
  text(ctx, "TELL THE ENGINE ROOM — THEIR GAUGE HAS NO BAND", w / 2, 182, 22, INK.dim);

  // LOW / OK / HIGH: three boxes, the live one filled with an arrow marker
  const labels = ["LOW", "OK", "HIGH"] as const;
  const bw = 240;
  const gap = 24;
  const bx0 = w / 2 - (bw * 3 + gap * 2) / 2;
  labels.forEach((l, i) => {
    const x = bx0 + i * (bw + gap);
    const on = d.status === l;
    const col = l === "OK" ? INK.green : l === "LOW" ? INK.amber : INK.red;
    roundRect(ctx, x, 222, bw, 92, 12);
    ctx.fillStyle = on ? col : "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.lineWidth = on ? 6 : 3;
    ctx.strokeStyle = on ? INK.white : INK.faint;
    ctx.stroke();
    text(ctx, l, x + bw / 2, 270, 52, on ? "#06150f" : INK.faint);
    if (on) {
      ctx.fillStyle = INK.white;
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, 330);
      ctx.lineTo(x + bw / 2 - 18, 354);
      ctx.lineTo(x + bw / 2 + 18, 354);
      ctx.closePath();
      ctx.fill();
    }
  });
  const slipping = d.status === "HIGH" && d.held && d.door < 100;
  text(
    ctx,
    slipping ? "⚠ RAMS SLIPPING — DOOR CLOSING — TELL THEM TO STOP" : `PRESSURE ${d.status === "OK" ? "IN BAND" : d.status === "LOW" ? "BELOW BAND" : "ABOVE BAND"}`,
    w / 2,
    378,
    28,
    slipping ? INK.red : INK.ink,
  );

  // door progress
  const px = 70;
  const pw = w - 140;
  const py = 420;
  const door = Math.max(0, Math.min(100, d.door));
  text(ctx, "DOOR", px, py - 2, 30, INK.ink, "left");
  text(ctx, `${Math.floor(door)}%`, px + pw, py - 2, 40, door >= 100 ? INK.green : INK.white, "right");
  roundRect(ctx, px, py + 24, pw, 54, 8);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK.ink;
  ctx.stroke();
  ctx.fillStyle = door >= 100 ? INK.green : INK.ink;
  ctx.fillRect(px + 6, py + 30, ((pw - 12) * door) / 100, 42);
  for (let i = 1; i < 10; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(px + (pw * i) / 10 - 1, py + 24, 2, 54);
  }

  // footer: release state / abandon state
  if (door >= 100) {
    const you = d.youAbandon ? "■ YOU: PULLED" : "□ YOU: NOT PULLED";
    const them = d.partnerAbandon ? "■ ENGINE ROOM: PULLED" : "□ ENGINE ROOM: NOT PULLED";
    text(ctx, "ABANDON SHIP — PULL TOGETHER (3 s)", w / 2, h - 82, 30, INK.amber);
    text(ctx, `${you}    ${them}`, w / 2, h - 40, 26, INK.white);
  } else {
    text(ctx, d.held ? "▶ RELEASE HELD" : "HOLD DOOR RELEASE WHILE PRESSURE IS OK", w / 2, h - 60, 30, d.held ? INK.green : INK.dim);
  }
  screenGlass(ctx, w, h);
}

// ------------------------------------------------------------ status board

export const PHASE_NAME: Record<string, string> = {
  LOBBY: "MUSTERING",
  PROLOGUE: "DEAD SHIP",
  POWER: "1 · EMERGENCY POWER",
  FLOOD: "2 · FLOOD CONTROL",
  RADIO: "3 · DISTRESS SIGNAL",
  CASCADE: "4 · CASCADE",
  ESCAPE: "FINAL · ABANDON SHIP",
  SURVIVED: "SHIP ABANDONED",
  LOST: "SHIP LOST",
};

const ROMAN = ["", "I", "II", "III", "IV", "V"] as const;

export type StatusData = { phase: string; act: number; trend: string; acknowledged: boolean; evac: number; gridDown: boolean };

export function drawStatus(ctx: Ctx, w: number, h: number, d: StatusData): void {
  const { phase, trend, acknowledged } = d;
  screenBg(ctx, w, h, { grid: false });
  header(ctx, w, "BRIDGE STATUS", `FLOODING: ${trend}`, { h: 56, color: trend === "STABLE" ? INK.ink : INK.amber });
  if (d.act >= 1 && d.act <= 5) {
    const title = ACT_TITLE[d.act as Act].toUpperCase();
    text(ctx, `ACT ${ROMAN[d.act]} — ${title}`, w / 2, 98, 38, d.gridDown ? INK.red : INK.ink);
  }
  if (phase === "CASCADE") {
    // the act's objective, big: charge the evac accumulator
    const p = Math.max(0, Math.min(100, d.evac));
    fitText(ctx, "CHARGE EVAC ACCUMULATOR", w / 2, 170, 56, w - 60, INK.white);
    const bx = 70;
    const bw = w - 300;
    roundRect(ctx, bx, 222, bw, 64, 10);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK.ink;
    ctx.stroke();
    ctx.fillStyle = p >= 100 ? INK.green : INK.ink;
    ctx.fillRect(bx + 6, 228, ((bw - 12) * p) / 100, 52);
    text(ctx, `${Math.floor(p)}%`, bx + bw + 110, 256, 72, INK.white);
    text(ctx, d.gridDown ? "NO SUPPLY — GENERATOR TRIPPED" : "COMMS ROOM · EVAC CIRCUIT ON", w / 2, 330, 28, d.gridDown ? INK.red : INK.dim);
  } else fitText(ctx, PHASE_NAME[phase] ?? phase, w / 2, h / 2 + 30, 84, w - 60, INK.white);
  const sub =
    phase === "PROLOGUE"
      ? acknowledged
        ? "ALARM ACKNOWLEDGED"
        : "ALARM ACTIVE — ACKNOWLEDGE"
      : phase === "SURVIVED"
        ? "ALL HANDS OFF"
        : phase === "LOST"
          ? "ALL HANDS LOST"
          : d.gridDown
            ? "EMERGENCY BATTERY — GRID DOWN"
            : "WATCH ON STATION";
  text(ctx, sub, w / 2, h - 40, 30, phase === "PROLOGUE" && !acknowledged ? INK.amber : INK.dim);
  screenGlass(ctx, w, h);
}

export { COMPARTMENTS };
