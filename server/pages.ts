// Server-rendered pages: /readme/ and /history/ are complete HTML with no
// client JavaScript required (spec/invariants.test.ts reads /readme/ raw).

import { marked } from "marked";
import { MODE_RULES, type Mode } from "../shared/config.ts";
import { COMPARTMENT_LABEL, COMPARTMENTS } from "../shared/glyphs.ts";
import { ACT_TITLE, type Act, type Debrief } from "../shared/protocol.ts";
import { clock, laneOf, LANES, ROMAN, SH, SP, SW, TRACK, turningPoints, LABEL_W, type MarkKind } from "../shared/timeline.ts";
import type { HistoryRow } from "./db.ts";

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `
  :root { --ink:#1b2a33; --paper:#f3efe4; --rule:#c9bfa6; --accent:#b23a2a; --muted:#5d6b70; --sea:#0f2430; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--sea); color:var(--ink); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header.bar { display:flex; gap:1rem; align-items:center; justify-content:space-between; padding:.8rem 1.2rem; color:#e9e4d6; background:#0a1a22; border-bottom:3px solid var(--accent); }
  header.bar a { color:#e9e4d6; text-decoration:none; font-weight:600; }
  header.bar nav { display:flex; gap:1rem; flex-wrap:wrap; }
  .brand { font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; letter-spacing:.12em; }
  main { max-width: 52rem; margin: 2rem auto; padding: 2rem clamp(1rem, 4vw, 3rem); background:var(--paper); border-radius:4px; box-shadow:0 10px 40px #0008; }
  h1, h2, h3 { line-height:1.25; letter-spacing:.02em; }
  h1 { border-bottom: 3px double var(--rule); padding-bottom:.4rem; }
  h2 { margin-top:2rem; border-bottom:1px solid var(--rule); }
  a { color:#1d5a7a; }
  code, pre { font-family: ui-monospace, Menlo, monospace; font-size:.9em; }
  pre { background:#e6e0cf; padding:.8rem; overflow:auto; border-radius:4px; }
  table { border-collapse: collapse; width:100%; margin:1rem 0; }
  th, td { text-align:left; padding:.45rem .6rem; border-bottom:1px solid var(--rule); vertical-align:top; }
  th { font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  img { max-width:100%; }
  blockquote { margin:1rem 0; padding:.2rem 1rem; border-left:4px solid var(--rule); color:var(--muted); }
  .play { display:inline-block; padding:.6rem 1.1rem; background:var(--accent); color:#fff !important; border-radius:4px; text-decoration:none; font-weight:700; }
  .survived { color:#1f6b3a; font-weight:700; } .lost { color:var(--accent); font-weight:700; }
  .muted { color:var(--muted); }
  .stats { display:flex; gap:2rem; flex-wrap:wrap; margin:1rem 0; }
  .stats div { font-size:.85rem; color:var(--muted); } .stats b { display:block; font-size:1.6rem; color:var(--ink); }
  .pill { display:inline-block; font-size:.7rem; letter-spacing:.08em; padding:.05rem .4rem; border-radius:3px; background:#d8cfb6; color:var(--ink); }
  .pill.practice { background:#f0c674; } .pill.mode { background:#6a3b8a; color:#fff; }
  @media (max-width: 640px) { table.log thead { display:none; } table.log td { display:block; border:0; padding:.1rem 0; } table.log tr { display:block; padding:.6rem 0; border-bottom:1px solid var(--rule); } }
`;

export function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230f2430'/%3E%3Cpath d='M4 20h24l-4 6H8z' fill='%23e9e4d6'/%3E%3Cpath d='M0 24q4-3 8 0t8 0 8 0 8 0v8H0z' fill='%231d5a7a'/%3E%3C/svg%3E" />
<style>${STYLE}</style>
</head>
<body>
<header class="bar">
  <a class="brand" href="/">BELOW THE WATERLINE</a>
  <nav><a href="/">Play</a><a href="/history/">Ship's Log</a><a href="/readme/">README</a></nav>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

export function readmePage(markdown: string): string {
  // README images are linked relative to the repo root (docs/…); serve them
  // from the same paths.
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  const fixed = html.replace(/(src|href)="(?!https?:|\/|#|mailto:)([^"]+)"/g, '$1="/$2"');
  return shell("README — Below the Waterline", `<p><a class="play" href="/">▶ Play Below the Waterline</a></p>\n${fixed}`);
}

export const fmtDuration = (ms: number | null): string => {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

const PHASE_NAME: Record<string, string> = {
  LOBBY: "Lobby",
  PROLOGUE: "Act I · Impact",
  POWER: "Act I · Emergency Power",
  FLOOD: "Act II · Stabilisation",
  RADIO: "Act III · Mayday",
  CASCADE: "Act IV · Cascade",
  ESCAPE: "Act V · Abandon Ship",
  SURVIVED: "Escaped",
  LOST: "Lost",
};

export function historyPage(
  rows: HistoryRow[],
  stats: { total: number; survived: number | null; lost: number | null; fastest: number | null },
): string {
  const body = rows.length
    ? `<table class="log">
<thead><tr><th>Voyage</th><th>Crew</th><th>Outcome</th><th>Reached</th><th>Time</th><th>Mistakes</th></tr></thead>
<tbody>
${rows
  .map((r) => {
    const outcome =
      r.status === "ACTIVE"
        ? `<span class="muted">At sea…</span>`
        : r.status === "ABANDONED"
          ? `<span class="muted">Abandoned</span>`
          : r.outcome === "SURVIVED"
            ? `<span class="survived">SURVIVED</span>`
            : `<span class="lost">LOST</span><br><span class="muted">${escapeHtml(r.failure_cause ?? "")}</span>`;
    const kind = [
      r.practice ? `<span class="pill practice">PRACTICE · ACT ${ROMAN[r.practice]}</span>` : "",
      r.mode && r.mode !== "STANDARD" ? `<span class="pill mode">${escapeHtml(MODE_RULES[r.mode as Mode]?.title ?? r.mode)}</span>` : "",
      r.rerun ? `<span class="pill">SAME SHIP</span>` : "",
    ].join(" ");
    const debrief = r.status === "ENDED" ? `<br><a href="/log/${escapeHtml(r.code)}/">Debrief →</a>` : "";
    return `<tr data-code="${escapeHtml(r.code)}">
<td><b>VOYAGE ${escapeHtml(r.code)}</b> ${kind}<br><span class="muted">${fmtDate(r.ended_at ?? r.created_at)}</span>${debrief}</td>
<td>Engineer: ${escapeHtml(r.engineer ?? "—")}<br>Radio Officer: ${escapeHtml(r.navigator ?? "—")}</td>
<td>${outcome}</td>
<td>${escapeHtml(PHASE_NAME[r.deepest_phase] ?? r.deepest_phase)}</td>
<td>${fmtDuration(r.duration_ms)}</td>
<td>${r.mistakes}</td>
</tr>`;
  })
  .join("\n")}
</tbody></table>`
    : `<p class="muted">No voyages logged yet. <a href="/">Be the first crew.</a></p>`;
  return shell(
    "Ship's Log — Below the Waterline",
    `<h1>Ship's Log</h1>
<p>Every voyage that left port, kept on the ship's disk across restarts and redeploys. Newest first.</p>
<div class="stats">
  <div><b>${stats.total}</b>voyages ended</div>
  <div><b>${stats.survived ?? 0}</b>crews survived</div>
  <div><b>${stats.lost ?? 0}</b>ships lost</div>
  <div><b>${fmtDuration(stats.fastest)}</b>fastest full Standard escape</div>
</div>
<p class="muted">Practice runs are listed but never count as a survived voyage.</p>
${body}
<p><a class="play" href="/">▶ New voyage</a></p>`,
  );
}

// ---- the voyage strip, server-side (layout in shared/timeline.ts) ----------

const glyph = (kind: MarkKind, x: number, y: number): string =>
  kind === "bad"
    ? `<path class="mk mk-bad" transform="translate(${x},${y})" d="M-5.5,-4 L5.5,-4 L0,5.5 Z"/>`
    : kind === "good"
      ? `<circle class="mk mk-good" cx="${x}" cy="${y}" r="5"/>`
      : kind === "peak"
        ? `<path class="mk mk-peak" transform="translate(${x},${y})" d="M0,-6 L6,0 L0,6 L-6,0 Z"/>`
        : `<rect class="mk mk-end" x="${x - 5}" y="${y - 5}" width="10" height="10"/>`;

function voyageStrip(d: Debrief): string {
  const dur = Math.max(1000, d.durationMs);
  const f = (n: number) => n.toFixed(1);
  const x = (t: number) => SP.l + (Math.min(t, dur) / dur) * (SW - SP.l - SP.r);
  const y = (v: number) => SP.t + (1 - Math.min(100, v) / 100) * (SP.b - SP.t);
  const nearest = (t: number) => d.samples.reduce<Debrief["samples"][number] | null>((b, s) => (!b || Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), null);
  const pts = d.samples.map((s) => [x(s.t), y(s.danger)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${f(px)},${f(py)}`).join(" ");
  const area = pts.length ? `${line} L${f(pts[pts.length - 1][0])},${SP.b} L${f(pts[0][0])},${SP.b} Z` : "";
  const list = (Object.entries(d.actTimes) as [string, number][]).map(([a, t]) => ({ act: Number(a) as Act, t })).sort((a, b) => a.t - b.t);
  const acts = list.map((a, i) => ({ ...a, end: list[i + 1]?.t ?? dur }));
  const marks = turningPoints(d);
  const lanes = laneOf(marks.map((m) => ({ x: x(m.t), label: m.label, kind: m.kind })), SW);
  const peak = Math.round(Math.max(0, ...d.samples.map((s) => s.danger)));
  const reached = acts[acts.length - 1];
  const aria = `Voyage timeline: ship danger from 0 to ${peak}% over ${clock(d.durationMs)}${reached ? `, reaching Act ${ROMAN[reached.act]}` : ""}. Turning points: ${marks.map((m) => `${clock(m.t)} ${m.label}`).join("; ")}.`;
  const bands = acts
    .map((a, i) => {
      const x0 = x(a.t);
      const w = x(a.end) - x0;
      const full = `${ROMAN[a.act]} · ${ACT_TITLE[a.act].toUpperCase()}`;
      const label = LABEL_W(full) < w ? full : LABEL_W(ROMAN[a.act]) < w + 6 ? ROMAN[a.act] : "";
      return `<rect x="${f(x0)}" y="${SP.t}" width="${f(Math.max(0, w))}" height="${SP.b - SP.t}" class="band${i % 2 ? " odd" : ""}"/><line x1="${f(x0)}" x2="${f(x0)}" y1="4" y2="${SP.b}" class="act-edge"/><text x="${f(x0 + 4)}" y="13" class="act-label">${escapeHtml(label)}</text>`;
    })
    .join("");
  const grid = [25, 50, 75]
    .map((v) => `<line x1="${SP.l}" x2="${SW - SP.r}" y1="${f(y(v))}" y2="${f(y(v))}" class="grid"/><text x="${SP.l - 5}" y="${f(y(v) + 3)}" class="axis" text-anchor="end">${v}</text>`)
    .join("");
  const markSvg = marks
    .map((m, i) => {
      const mx = x(m.t);
      const my = y(m.kind === "end" && d.result === "LOST" ? 100 : (nearest(m.t)?.danger ?? 0));
      const l = lanes[i];
      return `<g class="strip-mark ${m.kind}"><title>${escapeHtml(`${clock(m.t)} ${m.label}: ${m.detail}`)}</title><line x1="${f(mx)}" x2="${f(mx)}" y1="${f(my)}" y2="${TRACK - 7}" class="leader"/><circle cx="${f(mx)}" cy="${f(my)}" r="2.2" class="on-curve"/>${glyph(m.kind, Number(f(mx)), TRACK)}${l.lane >= 0 ? `<line x1="${f(mx)}" x2="${f(mx)}" y1="${TRACK + 7}" y2="${LANES[l.lane] - 9}" class="leader faint"/><text x="${f(l.lx)}" y="${LANES[l.lane]}" text-anchor="${l.anchor}" class="mark-label">${escapeHtml(m.label)}</text>` : ""}</g>`;
    })
    .join("");
  const key = (k: MarkKind, label: string) => `<span><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">${glyph(k, 0, 0)}</svg> ${label}</span>`;
  return `<figure class="strip-fig"><div class="strip-scroll">
<svg viewBox="0 0 ${SW} ${SH}" class="voyage-strip" role="img" aria-label="${escapeHtml(aria)}">
<defs><linearGradient id="strip-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e86a50" stop-opacity="0.55"/><stop offset="1" stop-color="#e86a50" stop-opacity="0.04"/></linearGradient></defs>
${bands}${grid}
<line x1="${SP.l}" x2="${SW - SP.r}" y1="${y(100)}" y2="${y(100)}" class="limit"/><text x="${SP.l - 5}" y="${y(100) + 3}" class="axis" text-anchor="end">100</text>
<text x="${SW - SP.r - 2}" y="${y(100) - 5}" class="axis limit-label" text-anchor="end">SHIP LOST AT 100%</text>
<line x1="${SP.l}" x2="${SW - SP.r}" y1="${SP.b}" y2="${SP.b}" class="base"/><text x="${SP.l - 5}" y="${SP.b + 3}" class="axis" text-anchor="end">0</text>
${area ? `<path d="${area}" fill="url(#strip-fill)"/>` : ""}${line ? `<path d="${line}" class="danger-line"/>` : ""}
${markSvg}
</svg></div>
<p class="swipe-hint" aria-hidden="true">◂ swipe the timeline ▸</p>
<figcaption class="strip-key"><span><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" class="danger-line"/></svg> ship danger %</span>${key("bad", "setback")}${key("good", "recovery")}${key("peak", "closest call")}${key("end", "end of voyage")}<span><svg width="10" height="14" aria-hidden="true"><line x1="5" x2="5" y1="0" y2="14" class="act-edge"/></svg> act boundary</span></figcaption>
</figure>`;
}

/** The log page's own look: the in-game voyage report (dark panel, stencil
 * headings, mono figures). Scoped to this page; /readme/ and /history/ keep
 * the shared paper style. */
const REPORT_STYLE = `
  @import url("https://fonts.googleapis.com/css2?family=Stardos+Stencil:wght@400;700&family=Share+Tech+Mono&display=swap");
  :root { --stencil: "Stardos Stencil", "Arial Black", Impact, sans-serif; --mono: "Share Tech Mono", ui-monospace, Menlo, monospace;
    --r-ink:#e9e4d6; --r-dim:#9fb0b8; --r-line:#ffffff1c; --r-gold:#f0c674; --r-bad:#e86a50; --r-good:#6cc27b; }
  body { background: #071219 radial-gradient(ellipse at top, #1d3b4d 0%, #0f2430 60%, #071219 100%) no-repeat; background-size: 100% 100vh; }
  main td { vertical-align: baseline; }
  main { max-width: 62rem; background:#0c171d; color:var(--r-ink); border:1px solid var(--r-line); border-top:6px solid var(--r-gold); }
  main:has(#report.rep-lost) { border-top-color: var(--r-bad); } main:has(#report.rep-survived) { border-top-color: var(--r-good); }
  main a { color:#8fc9e6; }
  .report-head { text-align:center; }
  .kicker { font:0.78rem var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--r-dim); margin:0; }
  .kicker .pill { margin-left:.3rem; }
  main h1 { border:0; font:1rem var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--r-dim); margin:.3rem 0 0; padding:0; }
  .outcome { font-family:var(--stencil); font-size:clamp(2.4rem, 9vw, 4.6rem); line-height:.95; text-transform:uppercase; letter-spacing:.06em; margin:.2em 0 .15em; text-shadow:0 4px 0 #0009; }
  .outcome.o-survived { color:var(--r-good); } .outcome.o-lost { color:var(--r-bad); }
  .reached { display:inline-block; font:1.15rem var(--stencil); letter-spacing:.22em; text-transform:uppercase; color:var(--r-gold); border-top:2px solid; border-bottom:2px solid; padding:0 .9rem; margin:.2rem 0; }
  .meta { font:.85rem var(--mono); color:var(--r-dim); letter-spacing:.06em; }
  .cause { color:var(--r-bad); font-weight:700; }
  main h2 { font:.95rem var(--stencil); letter-spacing:.2em; text-transform:uppercase; color:var(--r-gold); border:0; display:flex; align-items:center; gap:.6rem; margin:2rem 0 .6rem; }
  main h2::after { content:""; flex:1; height:1px; background:var(--r-line); }
  .strip-fig { margin:0; background:#071015; border:1px solid var(--r-line); border-radius:4px; padding:.5rem .5rem .4rem; }
  .strip-scroll { overflow-x:auto; }
  .voyage-strip { display:block; width:100%; min-width:560px; height:auto; font-family:var(--mono); }
  .band { fill:#ffffff05; } .band.odd { fill:#ffffff0c; }
  .act-edge { stroke:#f0c67499; stroke-dasharray:3 3; }
  .act-label { fill:var(--r-gold); font-size:9.5px; letter-spacing:.1em; }
  .voyage-strip .grid { stroke:#ffffff12; } .voyage-strip .base { stroke:#ffffff44; }
  .voyage-strip .limit { stroke:#e86a5088; stroke-dasharray:6 3; }
  .voyage-strip .axis { fill:#8796a0; font-size:9px; } .voyage-strip .limit-label { fill:#e86a50cc; font-size:8.5px; letter-spacing:.08em; }
  .danger-line { fill:none; stroke:#e86a50; stroke-width:2.4; stroke-linejoin:round; }
  .leader { stroke:#ffffff40; stroke-width:1; } .leader.faint { stroke:#ffffff22; }
  .on-curve { fill:#fff; }
  .mark-label { fill:#dfe7ea; font-size:9.5px; letter-spacing:.04em; }
  .strip-mark.bad .mark-label { fill:#f2a593; } .strip-mark.good .mark-label { fill:#a6dcae; }
  .strip-mark.peak .mark-label, .strip-mark.end .mark-label { fill:#fff; font-weight:700; }
  .mk { stroke:#071015; stroke-width:1.5; } .mk-bad { fill:#e86a50; } .mk-good { fill:#6cc27b; } .mk-peak { fill:#f0c674; } .mk-end { fill:#e9e4d6; }
  .strip-key { display:flex; flex-wrap:wrap; gap:.25rem 1rem; padding:.4rem .2rem 0; font:.75rem var(--mono); color:var(--r-dim); }
  .strip-key span { display:inline-flex; align-items:center; gap:.35rem; }
  .swipe-hint { display:none; margin:.2rem 0 0; text-align:center; font:.72rem var(--mono); letter-spacing:.1em; color:var(--r-dim); }
  .tp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 13.5rem), 1fr)); gap:.6rem; }
  .tp { display:flex; flex-direction:column; gap:.1rem; padding:.65rem .8rem .7rem; background:#101f27; border:1px solid var(--r-line); border-left:5px solid var(--r-gold); border-radius:3px; }
  .tp.good { border-left-color:var(--r-good); } .tp.bad { border-left-color:var(--r-bad); }
  .tp-tone { font:700 .66rem var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--r-gold); }
  .tp.good .tp-tone { color:#a6dcae; } .tp.bad .tp-tone { color:#f2a593; }
  .tp-label { font:.8rem var(--stencil); letter-spacing:.14em; }
  .tp-value { font:1.5rem/1.15 var(--mono); color:#fff; }
  .tp-detail { font-size:.82rem; color:var(--r-dim); }
  .lesson-cards { list-style:none; margin:0; padding:0; display:grid; gap:.45rem; }
  .lesson-cards li { display:grid; grid-template-columns:2.2rem 1fr; gap:.6rem; background:#e9e4d6; color:var(--ink); border-radius:3px; padding:.55rem .8rem; box-shadow:0 2px 0 #0006; }
  .lesson-n { font:1.2rem/1.1 var(--stencil); color:var(--accent); }
  main table { font-size:.9rem; } main th { color:var(--r-dim); } main th, main td { border-bottom-color:var(--r-line); }
  table.log td:first-child, main table:not(.log) td:last-child { font-family:var(--mono); white-space:nowrap; }
  td.ev-bad { color:#f2a593; } td.ev-good { color:#a6dcae; } tr.act td { color:var(--r-gold); font-weight:700; }
  .who { font:700 .72rem var(--mono); letter-spacing:.08em; color:var(--r-dim); }
  .crew-stats { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 9rem), 1fr)); gap:.45rem; margin:0; }
  .crew-stats div { background:#101f27; border:1px solid var(--r-line); border-radius:3px; padding:.4rem .6rem; }
  .crew-stats dt { font:700 .65rem var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--r-dim); }
  .crew-stats dd { margin:0; font:1.15rem var(--mono); color:#fff; overflow-wrap:anywhere; }
  .actions { margin-top:2rem; padding-top:1.1rem; border-top:1px solid var(--r-line); display:flex; flex-wrap:wrap; gap:.8rem; align-items:center; justify-content:center; }
  .actions .ghost { padding:.55rem 1rem; border:2px solid #e9e4d6aa; border-radius:4px; color:var(--r-ink); text-decoration:none; font:700 .9rem var(--mono); letter-spacing:.06em; text-transform:uppercase; }
  .pill { background:#2a3a42; color:var(--r-ink); }
  @media (max-width: 640px) {
    main { margin:0; border-radius:0; }
    .swipe-hint { display:block; }
    .actions > * { flex:1 1 100%; text-align:center; }
  }
`;

const TONE: Record<string, [string, string]> = { good: ["▲", "Went right"], bad: ["▼", "Cost you"], info: ["◆", "Note"] };

/** A voyage's debrief, server-rendered (no script needed): the outcome, the
 * voyage strip as inline SVG, turning points, lessons, crew, the ordered
 * event log and act times — the in-game voyage report's visual language. */
export function debriefPage(code: string, d: Debrief, crew: { engineer: string | null; navigator: string | null }): string {
  const survived = d.result === "SURVIVED";
  const acts = (Object.entries(d.actTimes) as [string, number][]).map(([a, t]) => ({ act: Number(a) as Act, t })).sort((a, b) => a.t - b.t);
  const reached = acts[acts.length - 1]?.act ?? 1;
  const lostLine = d.events.findLast((e) => e.k === "lost")?.text;
  const who = (a: string) => (a === "SHIP" ? "Ship" : a === "ENGINEER" ? "Engineer" : "Radio Officer");
  const body = `<style>${REPORT_STYLE}</style>
<div class="rep-${survived ? "survived" : "lost"}" id="report">
<header class="report-head">
<p class="kicker">Ship No. ${escapeHtml(d.shipNo)} ${d.practice ? `<span class="pill practice">PRACTICE FROM ACT ${ROMAN[d.practice]}</span>` : `<span class="pill">FULL VOYAGE</span>`}${d.mode !== "STANDARD" ? ` <span class="pill mode">${escapeHtml(MODE_RULES[d.mode]?.title ?? d.mode)}</span>` : ""}</p>
<h1>Debrief — voyage ${escapeHtml(code)}</h1>
<p class="outcome ${survived ? "o-survived" : "o-lost"}">${survived ? "▲ Survived" : "▼ Lost"}</p>
<p class="reached">${survived ? "All five acts" : `Act ${ROMAN[reached]} · ${escapeHtml(ACT_TITLE[reached as Act])}`}</p>
<p class="meta">${d.practice ? `PRACTICE from Act ${ROMAN[d.practice]}` : "FULL VOYAGE"} · ${escapeHtml(MODE_RULES[d.mode]?.title ?? d.mode)} · ${clock(d.durationMs)} · Engineer ${escapeHtml(crew.engineer ?? "—")}, Radio Officer ${escapeHtml(crew.navigator ?? "—")}</p>
${!survived && lostLine ? `<p class="cause">${escapeHtml(lostLine)}.</p>` : ""}
</header>
<h2>The voyage</h2>
${voyageStrip(d)}
<h2>Turning points</h2>
<div class="tp-grid">${d.highlights.map((h) => `<div class="tp ${h.tone}"><span class="tp-tone"><span aria-hidden="true">${TONE[h.tone][0]}</span> ${TONE[h.tone][1]}</span><span class="tp-label">${escapeHtml(h.label)}</span><b class="tp-value">${escapeHtml(h.value)}</b><span class="tp-detail">${escapeHtml(h.detail)}</span></div>`).join("")}</div>
<h2>What decided it</h2>
<ol class="lesson-cards">${d.lessons.map((l, i) => `<li><span class="lesson-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span>${escapeHtml(l)}</span></li>`).join("")}</ol>
<h2>Crew</h2>
<dl class="crew-stats">
<div><dt>Engineer</dt><dd>${escapeHtml(crew.engineer ?? "—")}</dd></div>
<div><dt>Radio Officer</dt><dd>${escapeHtml(crew.navigator ?? "—")}</dd></div>
<div><dt>Time</dt><dd>${clock(d.durationMs)}</dd></div>
<div><dt>Reached</dt><dd>${survived ? "Escaped" : `Act ${ROMAN[reached]}`}</dd></div>
<div><dt>Events logged</dt><dd>${d.events.length}</dd></div>
</dl>
<h2>Timeline</h2>
<table class="log"><thead><tr><th>Time</th><th>Who</th><th>Event</th></tr></thead><tbody>
${d.events.map((e) => `<tr${e.k === "act" ? ' class="act"' : ""}><td>${clock(e.t)}</td><td class="who">${who(e.actor)}</td><td class="${e.tone === "bad" ? "ev-bad" : e.tone === "good" ? "ev-good" : ""}">${e.tone === "bad" ? "▼ " : e.tone === "good" ? "● " : ""}${escapeHtml(e.text)}</td></tr>`).join("\n")}
</tbody></table>
${acts.length ? `<h2>Act times</h2><table><tbody>${acts.map(({ act, t }, i) => `<tr><td>${ROMAN[act]} · ${ACT_TITLE[act]}</td><td>${clock((acts[i + 1]?.t ?? d.durationMs) - t)}</td></tr>`).join("")}</tbody></table>` : ""}
<p class="actions"><a class="play" href="/?ship=${encodeURIComponent(d.shipNo)}">▶ Sail this ship again</a> <a class="ghost" href="/">New voyage</a> <a class="ghost" href="/history/">← Ship's Log</a></p>
</div>`;
  return shell(`Debrief ${code} — Below the Waterline`, body);
}

export function notFoundPage(): string {
  return shell("Not found — Below the Waterline", `<h1>Lost at sea</h1><p>There's nothing at this address.</p><p><a class="play" href="/">Back to port</a></p>`);
}
