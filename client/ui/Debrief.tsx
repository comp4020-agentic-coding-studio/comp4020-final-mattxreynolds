// The post-run debrief: an animated incident reconstruction from the
// server-recorded timeline. The chart draws itself in over a few seconds,
// then the player can scrub it: the cursor shows the ship's state and the
// events around that moment. Everything here comes from voyage.debrief.

import { useEffect, useMemo, useRef, useState } from "react";
import { MODE_RULES } from "../../shared/config.ts";
import { COMPARTMENT_LABEL, COMPARTMENTS } from "../../shared/glyphs.ts";
import { ACT_TITLE, type Act, type Debrief as DebriefData } from "../../shared/protocol.ts";

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

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
const ROMAN = ["", "I", "II", "III", "IV", "V"];

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

function nearest<T extends { t: number }>(xs: T[], t: number): T | null {
  let best: T | null = null;
  for (const s of xs) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}
