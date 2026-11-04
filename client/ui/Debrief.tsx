// The post-run debrief: an animated incident reconstruction from the
// server-recorded timeline. The chart draws itself in over a few seconds,
// then the player can scrub it: the cursor shows the ship's state and the
// events around that moment. Everything here comes from voyage.debrief.

import { useEffect, useMemo, useRef, useState } from "react";
import { MODE_RULES } from "../../shared/config.ts";
import { COMPARTMENT_LABEL, COMPARTMENTS } from "../../shared/glyphs.ts";
import { ACT_TITLE, type Act, type Debrief as DebriefData } from "../../shared/protocol.ts";
import { clock, laneOf, LANES, ROMAN, SH, SP, SW, TRACK, turningPoints, LABEL_W, type MarkKind } from "../../shared/timeline.ts";

export { clock };


const W = 720;
const H = 200;
const PAD = { l: 34, r: 10, t: 12, b: 22 };
/** Dash patterns so the series differ by more than colour. */
const SERIES = [
  { key: "danger", label: "Ship flooding", dash: "", cls: "s-danger" },
  { key: "water0", label: COMPARTMENT_LABEL.FORE, dash: "6 4", cls: "s-w0" },
  { key: "water1", label: COMPARTMENT_LABEL.CARGO, dash: "2 3", cls: "s-w1" },
  { key: "water2", label: COMPARTMENT_LABEL.ENGINE, dash: "10 3 2 3", cls: "s-w2" },
  { key: "heat", label: "Generator heat", dash: "1 4", cls: "s-heat" },
] as const;

export function Debrief({ d, compact = false }: { d: DebriefData; compact?: boolean }) {
  const dur = Math.max(1000, d.durationMs);
  const x = (t: number) => PAD.l + (t / dur) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const [cursor, setCursor] = useState<number | null>(null);
  // draw-in: the reconstruction plays once, then hands over to the scrubber
  const [reveal, setReveal] = useState(0);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (reduced) return setReveal(1);
    let raf = 0;
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 4000);
      setReveal(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [d, reduced]);

  const paths = useMemo(() => {
    const pick = (k: string) => (s: DebriefData["samples"][number]) =>
      k === "danger" ? s.danger : k === "heat" ? s.heat : s.water[Number(k.slice(5))];
    return SERIES.map((ser) => ({
      ...ser,
      d: d.samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(pick(ser.key)(s)).toFixed(1)}`).join(" "),
    }));
  }, [d]);

  const shownT = cursor ?? (reveal < 1 ? reveal * dur : null);
  const at = shownT === null ? null : nearest(d.samples, shownT);
  const recent = shownT === null ? d.events : d.events.filter((e) => e.t <= shownT);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("li.last");
    el?.scrollIntoView({ block: "nearest" });
  }, [recent.length]);

  const scrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setCursor(Math.max(0, Math.min(dur, ((px - PAD.l) / (W - PAD.l - PAD.r)) * dur)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = dur / 60;
    if (e.key === "ArrowRight") setCursor((c) => Math.min(dur, (c ?? 0) + step));
    if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, (c ?? dur) - step));
    if (e.key === "Escape") setCursor(null);
  };

  const acts = (Object.entries(d.actTimes) as [string, number][]).map(([a, t]) => ({ act: Number(a) as Act, t }));
  const markers = d.events.filter((e) => e.tone !== "info" || e.k === "act");

  return (
    <section className={`debrief ${compact ? "compact" : ""}`} data-testid="debrief" aria-label="Incident reconstruction">
      <header className="debrief-head">
        <h2>Incident reconstruction</h2>
        <p className="meta">
          {d.practice ? <span className="tag practice">PRACTICE FROM ACT {ROMAN[d.practice]}</span> : <span className="tag">FULL VOYAGE</span>}{" "}
          {MODE_RULES[d.mode]?.title ?? d.mode} · ship No. {d.shipNo} · {clock(d.durationMs)}
        </p>
      </header>

      <div className="highlights">
        {d.highlights.map((h) => (
          <div key={h.label} className={`hl ${h.tone}`}>
            <span className="hl-label">{h.label}</span>
            <b className="hl-value">{h.value}</b>
            <span className="hl-detail">{h.detail}</span>
          </div>
        ))}
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart"
          role="img"
          tabIndex={0}
          aria-label="Timeline of flooding, compartment levels and generator heat. Use left and right arrows to scrub."
          onPointerMove={scrub}
          onPointerDown={scrub}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
        >
          <defs>
            <clipPath id="reveal">
              <rect x={0} y={0} width={PAD.l + reveal * (W - PAD.l - PAD.r)} height={H} />
            </clipPath>
          </defs>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={PAD.l - 4} y={y(v) + 3} className="axis" textAnchor="end">{v}</text>
            </g>
          ))}
          {acts.map(({ act, t }) => (
            <g key={act}>
              <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} className="act-line" />
              <text x={x(t) + 3} y={H - 6} className="axis">{ROMAN[act]}</text>
            </g>
          ))}
          <g clipPath="url(#reveal)">
            {paths.map((p) => (
              <path key={p.key} d={p.d} className={`series ${p.cls}`} strokeDasharray={p.dash || undefined} />
            ))}
            {markers.map((e) => (
              <g key={e.seq} transform={`translate(${x(e.t)},${PAD.t + 2})`} className={`mark ${e.tone}`}>
                {e.tone === "bad" ? <path d="M-4,0 L4,0 L0,7 Z" /> : e.tone === "good" ? <circle r={3.5} cy={3} /> : <rect x={-1} width={2} height={7} />}
              </g>
            ))}
          </g>
          {shownT !== null && <line x1={x(shownT)} x2={x(shownT)} y1={PAD.t} y2={H - PAD.b} className="cursor" />}
        </svg>
        <ul className="legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <svg width="26" height="8" aria-hidden><line x1="0" x2="26" y1="4" y2="4" className={`series ${s.cls}`} strokeDasharray={s.dash || undefined} /></svg>
              {s.label}
            </li>
          ))}
          <li>▼ setback · ● recovery</li>
        </ul>
        {at && (
          <p className="readout" aria-live="polite">
            <b>{clock(at.t)}</b> flooding {Math.round(at.danger)}% · {COMPARTMENTS.map((c, i) => `${COMPARTMENT_LABEL[c]} ${at.water[i]}%`).join(" · ")} · heat {at.heat}% · evac {at.evac}%
          </p>
        )}
      </div>

      <div className="debrief-cols">
        <ol className="events" ref={listRef}>
          {recent.map((e, i) => (
            <li key={e.seq} className={`${e.tone} ${i === recent.length - 1 ? "last" : ""}`}>
              <time>{clock(e.t)}</time>
              <span className="who">{e.actor === "SHIP" ? "⚓" : e.actor === "ENGINEER" ? "ENG" : "BRG"}</span>
              <span>{e.k === "act" ? <b>{e.text}</b> : e.text}</span>
            </li>
          ))}
        </ol>
        <div className="lessons">
          <h3>What decided it</h3>
          <ul>
            {d.lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {acts.length > 1 && (
            <>
              <h3>Act times</h3>
              <dl className="act-times">
                {acts.map(({ act, t }, i) => {
                  const end = acts[i + 1]?.t ?? d.durationMs;
                  return (
                    <div key={act}>
                      <dt>{ROMAN[act]} · {ACT_TITLE[act]}</dt>
                      <dd>{clock(end - t)}</dd>
                    </div>
                  );
                })}
              </dl>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- the voyage strip: danger over time, act bands and turning points --------
// Layout and turning points come from shared/timeline.ts, which the
// server-rendered log page (server/pages.ts) uses too.

export function MarkGlyph({ kind, x = 0, y = 0, s = 1 }: { kind: MarkKind; x?: number; y?: number; s?: number }) {
  const t = `translate(${x},${y}) scale(${s})`;
  if (kind === "bad") return <path className="mk mk-bad" transform={t} d="M-5.5,-4 L5.5,-4 L0,5.5 Z" />;
  if (kind === "good") return <circle className="mk mk-good" transform={t} r={5} />;
  if (kind === "peak") return <path className="mk mk-peak" transform={t} d="M0,-6 L6,0 L0,6 L-6,0 Z" />;
  return <rect className="mk mk-end" transform={t} x={-5} y={-5} width={10} height={10} />;
}

/** Danger over the whole voyage, with act bands and turning-point markers. */
export function VoyageStrip({ d }: { d: DebriefData }) {
  const dur = Math.max(1000, d.durationMs);
  const x = (t: number) => SP.l + (Math.min(t, dur) / dur) * (SW - SP.l - SP.r);
  const y = (v: number) => SP.t + (1 - Math.min(100, v) / 100) * (SP.b - SP.t);
  const { line, area, marks, lanes, acts, dangerAt } = useMemo(() => {
    const pts = d.samples.map((s) => [x(s.t), y(s.danger)] as const);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${SP.b} L${pts[0][0].toFixed(1)},${SP.b} Z` : "";
    const dangerAt = (t: number) => {
      const n = nearest(d.samples, t);
      return n ? n.danger : 0;
    };
    const marks = turningPoints(d);
    const lanes = laneOf(marks.map((m) => ({ x: x(m.t), label: m.label, kind: m.kind })), SW);
    const list = (Object.entries(d.actTimes) as [string, number][]).map(([a, t]) => ({ act: Number(a) as Act, t })).sort((a, b) => a.t - b.t);
    const acts = list.map((a, i) => ({ ...a, end: list[i + 1]?.t ?? dur }));
    return { line, area, marks, lanes, acts, dangerAt };
  }, [d]);
  const reached = acts[acts.length - 1];
  return (
    <figure className="strip-fig">
      <div className="strip-scroll">
        <svg
          viewBox={`0 0 ${SW} ${SH}`}
          className="voyage-strip"
          role="img"
          aria-label={`Voyage timeline: ship danger from 0 to ${Math.round(Math.max(0, ...d.samples.map((s) => s.danger)))}% over ${clock(d.durationMs)}${reached ? `, reaching Act ${ROMAN[reached.act]}` : ""}. Turning points: ${marks.map((m) => `${clock(m.t)} ${m.label}`).join("; ")}.`}
        >
          <defs>
            <linearGradient id="strip-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e86a50" stopOpacity="0.55" />
              <stop offset="1" stopColor="#e86a50" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {acts.map((a, i) => {
            const x0 = x(a.t);
            const w = x(a.end) - x0;
            const full = `${ROMAN[a.act]} · ${ACT_TITLE[a.act].toUpperCase()}`;
            const label = LABEL_W(full) < w ? full : LABEL_W(ROMAN[a.act]) < w + 6 ? ROMAN[a.act] : "";
            return (
              <g key={a.act}>
                <rect x={x0} y={SP.t} width={Math.max(0, w)} height={SP.b - SP.t} className={i % 2 ? "band odd" : "band"} />
                <line x1={x0} x2={x0} y1={4} y2={SP.b} className="act-edge" />
                <text x={x0 + 4} y={13} className="act-label">{label}</text>
              </g>
            );
          })}
          {[25, 50, 75].map((v) => (
            <g key={v}>
              <line x1={SP.l} x2={SW - SP.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={SP.l - 5} y={y(v) + 3} className="axis" textAnchor="end">{v}</text>
            </g>
          ))}
          <line x1={SP.l} x2={SW - SP.r} y1={y(100)} y2={y(100)} className="limit" />
          <text x={SP.l - 5} y={y(100) + 3} className="axis" textAnchor="end">100</text>
          <text x={SW - SP.r - 2} y={y(100) - 5} className="axis limit-label" textAnchor="end">SHIP LOST AT 100%</text>
          <line x1={SP.l} x2={SW - SP.r} y1={SP.b} y2={SP.b} className="base" />
          <text x={SP.l - 5} y={SP.b + 3} className="axis" textAnchor="end">0</text>
          {area && <path d={area} fill="url(#strip-fill)" />}
          {line && <path d={line} className="danger-line" />}
          {marks.map((m, i) => {
            const mx = x(m.t);
            const my = y(m.kind === "end" && d.result === "LOST" ? 100 : dangerAt(m.t));
            const l = lanes[i];
            return (
              <g key={`${m.t}${m.label}`} className={`strip-mark ${m.kind}`}>
                <title>{`${clock(m.t)} ${m.label}: ${m.detail}`}</title>
                <line x1={mx} x2={mx} y1={my} y2={TRACK - 7} className="leader" />
                <circle cx={mx} cy={my} r={2.2} className="on-curve" />
                <MarkGlyph kind={m.kind} x={mx} y={TRACK} />
                {l.lane >= 0 && (
                  <>
                    <line x1={mx} x2={mx} y1={TRACK + 7} y2={LANES[l.lane] - 9} className="leader faint" />
                    <text x={l.lx} y={LANES[l.lane]} textAnchor={l.anchor} className="mark-label">{m.label}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="swipe-hint" aria-hidden>◂ swipe the timeline ▸</p>
      <figcaption className="strip-key">
        <span><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" className="danger-line" /></svg> ship danger %</span>
        {(["bad", "good", "peak", "end"] as MarkKind[]).map((k) => (
          <span key={k}><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden><MarkGlyph kind={k} /></svg> {({ bad: "setback", good: "recovery", peak: "closest call", end: "end of voyage" } as const)[k]}</span>
        ))}
        <span><svg width="10" height="14" aria-hidden><line x1="5" x2="5" y1="0" y2="14" className="act-edge" /></svg> act boundary</span>
      </figcaption>
    </figure>
  );
}

function nearest<T extends { t: number }>(xs: T[], t: number): T | null {
  let best: T | null = null;
  for (const s of xs) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}
