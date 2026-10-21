// Server-rendered pages: /readme/ and /history/ are complete HTML with no
// client JavaScript required (spec/invariants.test.ts reads /readme/ raw).

import { marked } from "marked";
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
  PROLOGUE: "Prologue",
  POWER: "Emergency Power",
  FLOOD: "Flood Control",
  RADIO: "Distress Signal",
  ESCAPE: "Final Escape",
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
    return `<tr data-code="${escapeHtml(r.code)}">
<td><b>VOYAGE ${escapeHtml(r.code)}</b><br><span class="muted">${fmtDate(r.ended_at ?? r.created_at)}</span></td>
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
  <div><b>${fmtDuration(stats.fastest)}</b>fastest escape</div>
</div>
${body}
<p><a class="play" href="/">▶ New voyage</a></p>`,
  );
}

export function notFoundPage(): string {
  return shell("Not found — Below the Waterline", `<h1>Lost at sea</h1><p>There's nothing at this address.</p><p><a class="play" href="/">Back to port</a></p>`);
}
