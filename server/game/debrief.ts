// The post-run debrief: sampled ship state for the timeline, plus highlights
// and plain-language lessons computed from what actually happened. Built once
// when the voyage ends and persisted inside state_json.

import { MAX_SAMPLES, SAMPLE_EVERY_MS } from "../../shared/config.ts";
import { COMPARTMENTS, COMPARTMENT_LABEL } from "../../shared/glyphs.ts";
import { ACT_OF, ACT_START, type Act, type Debrief, type Highlight, type Phase } from "../../shared/protocol.ts";
import type { Voyage } from "./state.ts";

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Appends a timeline sample every SAMPLE_EVERY_MS of play (or now, if forced). */
export function recordSample(v: Voyage, force = false): void {
  const last = v.samples[v.samples.length - 1];
  if (!force && last && v.elapsedMs - last.t < SAMPLE_EVERY_MS) return;
  v.samples.push({
    t: Math.round(v.elapsedMs),
    danger: Math.round(v.danger * 10) / 10,
    water: COMPARTMENTS.map((c) => Math.round(v.flood.levels[c])) as [number, number, number],
    heat: Math.round(v.ship.grid.heat),
    evac: Math.round(v.ship.evac),
  });
  if (v.samples.length > MAX_SAMPLES) {
    // keep the whole run by thinning every other sample
    v.samples = v.samples.filter((_, i) => i % 2 === 0 || i === v.samples.length - 1);
  }
}

const count = (v: Voyage, k: string): number => v.log.filter((e) => e.k === k).length;

export function buildDebrief(v: Voyage): Debrief {
  const s = v.ship;
  const survived = v.phase === "SURVIVED";
  const highlights: Highlight[] = [];
  const lessons: string[] = [];

  if (s.peakLevel && s.peakLevel.level > 0) {
    highlights.push({
      label: "CLOSEST CALL",
      value: `${Math.round(s.peakDanger)}% flooded`,
      detail: `Worst compartment: ${COMPARTMENT_LABEL[s.peakLevel.c]} at ${Math.round(s.peakLevel.level)}% (${fmt(s.peakLevel.t)})`,
      tone: s.peakDanger > 80 ? "bad" : "info",
    });
  }
  const trips = s.powerTrips + s.grid.trips;
  highlights.push({
    label: "GENERATOR TRIPS",
    value: String(trips),
    detail: trips ? `${s.powerTrips} at the breakers, ${s.grid.trips} from overload — each one wore the generator` : "The generator never tripped",
    tone: trips ? "bad" : "good",
  });
  const contact = v.log.find((e) => e.k === "contact");
  highlights.push({
    label: "DISTRESS SIGNAL",
    value: contact ? fmt(contact.t) : "never sent",
    detail: contact ? "A shore station had your position" : "No station heard the ship",
    tone: contact ? "good" : "bad",
  });
  const bursts = count(v, "burst");
  if (bursts) highlights.push({ label: "RELIEF BURSTS", value: String(bursts), detail: "Each cracked a seam that leaked for the rest of the voyage", tone: "bad" });
  const lost = COMPARTMENTS.filter((c) => s.lost[c]);
  if (lost.length) {
    highlights.push({ label: "COMPARTMENTS LOST", value: String(lost.length), detail: lost.map((c) => COMPARTMENT_LABEL[c]).join(", "), tone: "bad" });
  }
  if (s.callsAnswered + s.callsMissed > 0) {
    highlights.push({
      label: "COAST STATION CALLS",
      value: `${s.callsAnswered} / ${s.callsAnswered + s.callsMissed}`,
      detail: s.callsAnswered ? "Each answered call slowed the water in the final escape" : "Unanswered calls left rescue further away",
      tone: s.callsAnswered ? "good" : "bad",
    });
  }
  const recovery = v.log.find((e) => e.k === "floodStable");
  if (recovery) highlights.push({ label: "MAJOR RECOVERY", value: fmt(recovery.t), detail: "Every compartment pumped below 20%", tone: "good" });
  if (survived && s.margin !== null) {
    highlights.push({
      label: "FINAL ESCAPE MARGIN",
      value: `${s.margin.toFixed(1)} s`,
      detail: "How long the ship would have stayed afloat at the rate it was sinking",
      tone: s.margin < 20 ? "bad" : "good",
    });
  }

  // lessons: the reasons a crew would give for how it went
  if (s.powerTrips >= 2) lessons.push(`${s.powerTrips} breaker trips in Act I wore the generator: it could carry ${Math.min(s.powerTrips, 2)} less load for the rest of the voyage.`);
  if (s.grid.trips) lessons.push(`The generator overloaded ${s.grid.trips} time${s.grid.trips > 1 ? "s" : ""}. Shedding a circuit before the heat gauge reached the red would have kept the pumps running.`);
  if (bursts) lessons.push(`${bursts} relief valve burst${bursts > 1 ? "s" : ""} in flood control left leaking seams that kept adding water in later acts.`);
  if (lost.length) lessons.push(`Losing ${lost.map((c) => COMPARTMENT_LABEL[c]).join(" and ")} added a permanent load of water the pumps could never remove.`);
  if (s.callsMissed) lessons.push(`${s.callsMissed} coast-station call${s.callsMissed > 1 ? "s were" : " was"} missed. The Bridge sees the caller's bearing; the Engineer has to aim the antenna there before the Bridge answers.`);
  if (count(v, "wrongStation")) lessons.push("Transmitting to the wrong station cost water. The Engineer's pulse rhythm, matched in the Bridge's codebook, names the right one.");
  if (count(v, "vent")) lessons.push("The door rams vented from over-pressure. The Bridge knows the band; call \"more\" and \"stop\".");
  if (!survived && v.failureCause) lessons.unshift(`${v.failureCause}.`);
  if (survived && !lessons.length) lessons.push("A clean voyage: no trips, no bursts, no lost compartments.");

  const actTimes: Partial<Record<Act, number>> = {};
  for (const [phase, t] of Object.entries(v.phaseTimes) as [Phase, number][]) {
    const act = ACT_OF[phase];
    if (act && ACT_START[act] === phase) actTimes[act] = Math.round(t);
    if (act && actTimes[act] === undefined) actTimes[act] = Math.round(t);
  }

  return {
    shipNo: String(v.seed),
    mode: v.mode,
    practice: v.practice,
    result: survived ? "SURVIVED" : "LOST",
    durationMs: Math.round(v.elapsedMs),
    events: v.log.slice(),
    samples: v.samples.slice(),
    highlights,
    lessons,
    actTimes,
  };
}
