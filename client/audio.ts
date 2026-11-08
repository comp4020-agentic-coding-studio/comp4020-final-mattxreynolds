// Procedural WebAudio: no audio files. Starts on the first user gesture
// (autoplay policy), respects mute/volume, and never carries information
// that isn't also shown visually (CLAUDE.md invariant 8 / GAME_DESIGN.md).

import { ROOM_UNLOCK, type Fx, type View } from "../shared/protocol.ts";
import { PULSE_TIMING, pulseAt } from "./scene/engine/pulse.ts";
import { onFx, useStore } from "./store.ts";

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let rumble: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let alarm: { gain: GainNode; osc: OscillatorNode } | null = null;
/** Engineer: a straining pump motor heard through the suction lines. */
let pumpHum: { gain: GainNode; osc: OscillatorNode } | null = null;
/** Engineer: water running backwards through an open suction line. */
let gurgle: GainNode | null = null;
/** Both: the watertight door's rams grinding while the door moves. */
let grind: GainNode | null = null;
/** Engineer: the generator straining as its heat climbs. */
let whine: { gain: GainNode; osc: OscillatorNode } | null = null;
/** Both: rain/wind bed, shifts per act; and water rushing with the flood level. */
let bed: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let rush: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let drone: { gain: GainNode; osc: OscillatorNode } | null = null;
let lastDoorMoveAt = -1e9;
let started = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  applyVolume();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function applyVolume(): void {
  if (!ctx) return;
  const { muted, volume } = useStore.getState();
  master.gain.setTargetAtTime(muted ? 0 : volume * 0.6, ctx.currentTime, 0.05);
}

function noise(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass", at = 0): void {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", at = 0, slideTo?: number): void {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => noise(0.05, 2400, 4, 0.5, "bandpass"),
  relay: () => {
    noise(0.04, 1800, 6, 0.6);
    noise(0.04, 1200, 6, 0.4, "bandpass", 0.06);
  },
  clunk: () => {
    tone(90, 0.25, 0.5, "triangle", 0, 50);
    noise(0.12, 600, 1, 0.5, "lowpass");
    // mechanical tail: contacts settling and a short metallic ring
    noise(0.05, 2200, 5, 0.25, "bandpass", 0.14);
    noise(0.04, 1500, 5, 0.18, "bandpass", 0.24);
    tone(310, 0.5, 0.05, "triangle", 0.05, 280);
  },
  /** Valve wheel turning: a dry rising squeal over a rattle. */
  squeal: () => {
    tone(900 + Math.random() * 300, 0.45, 0.04, "sawtooth", 0, 1500);
    noise(0.4, 1800, 8, 0.12, "bandpass");
  },
  /** Radio static sweeping across the band. */
  sweep: () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 1.1);
  },
  /** Distant thunder: a long low rumble with a late swell. */
  thunder: () => {
    noise(4, 90, 0.7, 0.5, "lowpass", 0.1);
    noise(2.5, 180, 0.5, 0.25, "lowpass", 1.2);
  },
  /** Hull creak: a short stressed-metal glide. */
  creak: () => {
    const f = 140 + Math.random() * 160;
    tone(f, 0.9, 0.05, "sawtooth", 0, f * (0.7 + Math.random() * 0.2));
    tone(f * 1.5, 0.7, 0.025, "square", 0.05, f * 1.2);
  },
  /** Act stinger: low brass-like swell, more urgent in later acts. */
  stinger: (act: number) => {
    const base = 55 + act * 6;
    tone(base, 1.8, 0.28, "sawtooth", 0, base * 0.8);
    tone(base * 1.5, 1.6, 0.12, "square", 0.05, base * 1.4);
    noise(1.2, 300 + act * 150, 1, 0.2, "lowpass", 0.1);
    if (act >= 4) for (let i = 0; i < 3; i++) tone(880, 0.12, 0.06, "square", 0.3 + i * 0.22);
  },
  /** Failure: a falling minor figure and a hull groan. */
  failure: () => [392, 349, 294, 220].forEach((f, i) => tone(f, 0.9, 0.14, "triangle", i * 0.35, f * 0.97)),
  spark: () => {
    for (let i = 0; i < 5; i++) noise(0.06, 3000 + Math.random() * 3000, 2, 0.5, "highpass", i * 0.04);
    tone(60, 0.5, 0.3, "sawtooth", 0, 30);
  },
  steam: () => noise(1.4, 5000, 0.5, 0.45, "highpass"),
  hum: () => tone(110, 1.2, 0.18, "sawtooth", 0, 112),
  powerUp: () => {
    tone(40, 1.8, 0.35, "sawtooth", 0, 120);
    tone(80, 1.8, 0.15, "square", 0.1, 240);
  },
  reject: () => tone(180, 0.18, 0.25, "square", 0, 120),
  success: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, 0.18, "triangle", i * 0.12)),
  wrong: () => {
    tone(330, 0.3, 0.2, "square");
    tone(247, 0.4, 0.2, "square", 0.3);
  },
  static: () => noise(0.8, 2500, 0.4, 0.25, "bandpass"),
  groan: () => {
    if (!ctx) return;
    tone(45 + Math.random() * 20, 2.5, 0.35, "sawtooth", 0, 30 + Math.random() * 10);
    noise(2, 200, 2, 0.2, "lowpass");
  },
  door: () => {
    tone(55, 2.5, 0.4, "sawtooth", 0, 35);
    noise(2.5, 300, 1, 0.3, "lowpass");
  },
  /** Pulse-lamp beep: flat sustain for exactly the lamp's on-time. */
  beep: (dur: number) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.012);
    g.gain.setValueAtTime(0.09, t + Math.max(0.02, dur - 0.025));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  /** A new phase begins: two soft bell strikes. */
  chime: () => {
    tone(784, 0.9, 0.12, "triangle");
    tone(1046, 1.1, 0.1, "triangle", 0.18);
  },
  /** Bridge: power dies on a trip (the Bridge sees lamps drop, not sparks). */
  powerDown: () => {
    noise(0.04, 1800, 6, 0.5);
    tone(220, 0.6, 0.18, "sawtooth", 0, 55);
  },
  /** Soft relay tick: a remote control changed something on this side. */
  tick: (freq = 1500) => noise(0.035, freq, 8, 0.35),
  /** Short slosh: water flow changed direction somewhere. */
  slosh: () => noise(0.6, 380, 1.2, 0.22, "lowpass"),
  /** Pump motor spinning up / winding down (Engineer hears the remote pump). */
  motor: (up: boolean) => tone(up ? 45 : 80, 0.7, 0.2, "sawtooth", 0, up ? 80 : 40),
  /** A coast station is calling: two-tone telephone ring. */
  ring: () => {
    for (let i = 0; i < 2; i++) {
      tone(1200, 0.18, 0.08, "square", i * 0.25);
      tone(1450, 0.18, 0.06, "square", i * 0.25 + 0.09);
    }
  },
  /** Hull plating gives way: a deep bang and rushing water. */
  breach: () => {
    tone(38, 1.6, 0.6, "sawtooth", 0, 24);
    noise(0.3, 160, 1, 0.8, "lowpass");
    noise(2.6, 900, 0.6, 0.3, "bandpass", 0.15);
  },
  /** Grid dies: everything spins down. */
  blackout: () => {
    tone(160, 1.4, 0.3, "sawtooth", 0, 30);
    noise(0.08, 1400, 4, 0.6);
  },
  /** Rising ping: in band / locked. */
  ping: () => tone(1320, 0.25, 0.1, "sine"),
  stroke: () => {
    noise(0.15, 400, 2, 0.35, "lowpass");
    tone(140, 0.12, 0.15, "triangle");
  },
};

function setLoops(view: View | null): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (!rumble) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 120;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    rumble = { gain, filter };
  }
  if (!alarm) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    alarm = { gain, osc };
  }
  if (!pumpHum) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 50;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    pumpHum = { gain, osc };
  }
  if (!gurgle) gurgle = loopedNoise(420, 1.5, "lowpass");
  if (!grind) grind = loopedNoise(160, 3, "bandpass");
  if (!whine) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    whine = { gain, osc };
  }
  if (!bed) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    bed = { gain, filter };
  }
  if (!rush) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    rush = { gain, filter };
  }
  if (!drone) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 41;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    drone = { gain, osc };
  }
  const phase = view?.phase;
  const actNo = actOf(phase);
  const playingNow = Boolean(phase && phase !== "LOBBY" && phase !== "SURVIVED" && phase !== "LOST");
  // act-dependent bed: I uncertain (low drone, soft wind), V urgent (louder, higher, dissonant)
  bed.gain.gain.setTargetAtTime(playingNow ? 0.02 + actNo * 0.012 : 0.01, t, 1);
  bed.filter.frequency.setTargetAtTime(350 + actNo * 120, t, 1);
  drone.gain.gain.setTargetAtTime(playingNow ? 0.09 - actNo * 0.008 : 0, t, 1);
  drone.osc.frequency.setTargetAtTime(41 + actNo * 3.5, t, 2);
  // water rushing scales with the flood level the view provides
  const dng = view?.danger ?? 0;
  const wet = playingNow && waterLive(phase) ? dng / 100 : 0;
  rush.gain.gain.setTargetAtTime(wet * wet * 0.35, t, 0.6);
  rush.filter.frequency.setTargetAtTime(300 + wet * 1400, t, 0.6);
  const playing = phase && phase !== "LOBBY" && phase !== "SURVIVED" && phase !== "LOST";
  const danger = view?.danger ?? 0;
  const engine = view?.you === "ENGINEER";
  const gridDown = Boolean(view?.ship?.gridDown);
  const powered = phase !== "PROLOGUE" && phase !== "POWER" && !gridDown;
  rumble.gain.gain.setTargetAtTime(playing ? (engine ? (powered ? 0.5 : 0.25) : 0.15) : 0, t, 0.5);
  rumble.filter.frequency.setTargetAtTime(powered ? 160 : 90, t, 0.5);
  const alarmOn = playing && (phase === "PROLOGUE" ? !view!.prologue.acknowledged : danger >= 75);
  alarm.gain.gain.setTargetAtTime(alarmOn ? 0.035 : 0, t, 0.05);

  // The Engineer can't see the pumps, only the line pressure each one puts on
  // its valve: deadhead strain → a labouring motor, backflow → a gurgle.
  let strain = 0;
  let back = 0;
  let running = 0;
  // water is live from Act II to the end, so the lines are too
  if (view?.you === "ENGINEER" && waterLive(phase) && !gridDown) {
    for (const [c, { pressure }] of Object.entries(view.flood.valves)) {
      if (pressure > 0) strain = Math.max(strain, pressure);
      else if (pressure < 0) back++;
      if (lineDriven[c]) running++;
    }
  }
  // the generator's heat is heard as a rising whine (its gauge is in the Aux room)
  const heat = view?.you === "ENGINEER" && waterLive(phase) && !gridDown ? view.grid.heat : 0;
  whine.gain.gain.setTargetAtTime(heat > 40 ? ((heat - 40) / 60) * 0.06 : 0, t, 0.3);
  whine.osc.frequency.setTargetAtTime(280 + heat * 4, t, 0.3);
  const humLevel = running > 0 || strain > 0 ? 0.04 + Math.min(running, 2) * 0.03 + (strain / 100) * 0.1 : 0;
  pumpHum.gain.gain.setTargetAtTime(humLevel, t, 0.3);
  pumpHum.osc.frequency.setTargetAtTime(48 + (strain / 100) * 30, t, 0.3);
  gurgle.gain.setTargetAtTime(Math.min(back, 2) * 0.12, t, 0.4);
  const doorMoving = playing && performance.now() - lastDoorMoveAt < 700;
  grind.gain.setTargetAtTime(doorMoving ? (engine ? 0.35 : 0.15) : 0, t, 0.15);
}

function loopedNoise(freq: number, q: number, type: BiquadFilterType): GainNode {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx!.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx!.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  return gain;
}

const actOf = (p: string | undefined): number => (p === "PROLOGUE" || p === "POWER" ? 1 : p === "FLOOD" ? 2 : p === "RADIO" ? 3 : p === "CASCADE" ? 4 : p === "ESCAPE" ? 5 : 1);

const waterLive = (p: string | undefined): boolean => p === "FLOOD" || p === "RADIO" || p === "CASCADE" || p === "ESCAPE";

// ------------------------------------------------ pulse-lamp beeps (Engineer)

/** Engineer's inference of which suction lines have a running pump. */
const lineDriven: Record<string, boolean> = {};
/** The gauge reading the server uses for backflow (server/game/voyage.ts). */
const BACKFLOW_READING = -25;

let beepIdx = -1;
/** Polled every 25 ms: beeps on each lamp-on edge, using the same clock and
 * timing as the lamp (scene/engine/pulse.ts), so sound and light agree. */
function pulseTick(): void {
  const view = useStore.getState().view;
  const pattern = view?.you === "ENGINEER" && view.phase === "RADIO" ? view.radio.pulse : null;
  if (!ctx || !pattern) {
    beepIdx = -1;
    return;
  }
  const idx = pulseAt(pattern, performance.now());
  if (idx >= 0 && idx !== beepIdx) {
    sfx.beep((pattern[idx] ? PULSE_TIMING.longMs : PULSE_TIMING.shortMs) / 1000);
  }
  beepIdx = idx;
}

// ------------------------------------------------ cross-room view changes

/** Sounds for state that changed because of the *other* player (or the
 * simulation), derived from consecutive views. Every one of these has a
 * visual twin in the room (lamp, gauge, screen or door). */
function onViewChange(v: View | null, prev: View | null): void {
  // a new room unlocks: its bulkhead door grinds open (the door animates in the scene)
  if (ctx && v && prev && v.code === prev.code && v.phase !== prev.phase) {
    if ((v.you === "ENGINEER" && v.phase === ROOM_UNLOCK.AUX) || (v.you === "NAVIGATOR" && v.phase === ROOM_UNLOCK.COMMS)) sfx.door();
  }
  if (!ctx || !v || !prev || v.code !== prev.code || v.you !== prev.you || v.phase !== prev.phase) {
    for (const k of Object.keys(lineDriven)) delete lineDriven[k];
    return;
  }
  if (v.escape.door > prev.escape.door) lastDoorMoveAt = performance.now();
  if (v.you === "NAVIGATOR" && prev.you === "NAVIGATOR") {
    // Engineer closed/opened a breaker → a system lamp changed
    if (v.phase === "POWER" && !v.power.tripped && JSON.stringify(v.power.fed) !== JSON.stringify(prev.power.fed)) sfx.tick(1300);
    // Engineer opened/shut a valve → a trend arrow flipped
    if (waterLive(v.phase) && JSON.stringify(v.flood.trends) !== JSON.stringify(prev.flood.trends)) sfx.slosh();
    // Engineer turned the antenna → signal meter moved
    if (v.phase === "RADIO" && Math.abs(v.radio.signal - prev.radio.signal) > 0.05) sfx.tick(900 + v.radio.signal * 1500);
    // Engineer reset the generator → the distribution panel has supply again
    if (prev.ship.gridDown && !v.ship.gridDown) sfx.powerUp();
    // Engineer pumped the rams → band status changed
    if (v.phase === "ESCAPE" && v.escape.status !== prev.escape.status) (v.escape.status === "OK" ? sfx.ping : () => sfx.tick(700))();
  } else if (v.you === "ENGINEER" && prev.you === "ENGINEER") {
    // Bridge tuned the carrier → resonance needle moved (hotter = higher tick)
    if (v.phase === "RADIO" && v.radio.resonance !== prev.radio.resonance) sfx.tick(600 + v.radio.resonance * 2400);
    if (v.phase === "RADIO" && v.radio.lock && !prev.radio.lock) sfx.ping();
    // Bridge switched a circuit → a relay clacks in the Engine Room's switchboard
    if (JSON.stringify(v.ship.circuits) !== JSON.stringify(prev.ship.circuits)) sfx.relay();
    if (v.ship.armed && !prev.ship.armed) sfx.clunk();
    // Bridge started/stopped a pump → a suction line came alive or went slack
    if (waterLive(v.phase)) {
      for (const c of Object.keys(v.flood.valves) as (keyof typeof v.flood.valves)[]) {
        const a = prev.flood.valves[c];
        const b = v.flood.valves[c];
        const was = lineDriven[c] ?? false;
        // valve open: backflow pins the gauge at −25 only while its pump is off.
        // valve shut: the gauge climbs only while its pump is on (deadhead).
        const now = b.open ? b.pressure > BACKFLOW_READING : b.pressure !== a.pressure ? b.pressure > a.pressure : was;
        lineDriven[c] = now;
        if (now !== was && a.open === b.open) sfx.motor(now);
        if (a.open !== b.open) sfx.squeal();
      }
    }
    if (v.phase === "ESCAPE" && v.escape.pressure > prev.escape.pressure + 4) sfx.stroke();
  }
}

let alarmPhase = 0;
let lastGroan = 0;
let lastRing = 0;
let nextCreak = 0;
let nextThunder = 0;
function loop(): void {
  if (!ctx) return;
  const view = useStore.getState().view;
  setLoops(view);
  if (alarm) {
    alarmPhase ^= 1;
    alarm.osc.frequency.setValueAtTime(alarmPhase ? 660 : 520, ctx.currentTime);
  }
  const danger = view?.danger ?? 0;
  const now = performance.now();
  // a ringing coast station keeps ringing (its lamp flashes on the Bridge)
  if (view?.ship?.calling && Math.floor(now / 2700) !== lastRing) {
    lastRing = Math.floor(now / 2700);
    sfx.ring();
  }
  const live = Boolean(view && view.phase !== "LOBBY" && view.phase !== "SURVIVED" && view.phase !== "LOST");
  // hull creaks at random intervals that shorten as danger grows
  if (live && now > nextCreak) {
    sfx.creak();
    nextCreak = now + (3000 + Math.random() * 9000) * (1 - danger / 130);
  }
  if (live && now > nextThunder) {
    sfx.thunder();
    nextThunder = now + 14000 + Math.random() * 26000;
  }
  if (view && view.phase !== "LOBBY" && danger > 20 && now - lastGroan > 9000 - danger * 50 && Math.random() < 0.3) {
    lastGroan = now;
    sfx.groan();
  }
}

const FX_SOUND: Partial<Record<Fx["k"], (fx: Fx) => void>> = {
  busOn: () => (sfx.relay(), sfx.powerUp()),
  ack: () => sfx.relay(),
  trip: () => (useStore.getState().view?.you === "NAVIGATOR" ? sfx.powerDown() : sfx.spark()),
  powerOnline: () => (sfx.powerUp(), sfx.success()),
  burst: () => sfx.steam(),
  floodStable: () => sfx.success(),
  arc: () => sfx.spark(),
  coupled: () => sfx.hum(),
  reply: (fx) => {
    sfx.sweep();
    if (fx.k === "reply") (fx.result === "contact" ? sfx.success : sfx.wrong)();
  },
  vent: () => sfx.steam(),
  gridTrip: () => sfx.blackout(),
  gridReset: () => sfx.powerUp(),
  overheat: () => (useStore.getState().view?.you === "ENGINEER" ? sfx.steam() : undefined),
  breach: () => sfx.breach(),
  compartmentLost: () => (sfx.groan(), sfx.breach()),
  call: () => sfx.ring(),
  callResult: (fx) => (fx.k === "callResult" && fx.answered ? (sfx.static(), sfx.success()) : sfx.wrong()),
  evacCharged: () => sfx.chime(),
  // compartment fire (ADR 006): heard on both seats, always with a visual twin
  fire: (fx) => {
    if (fx.k !== "fire") return;
    if (fx.ev === "ignite" || fx.ev === "burnout") sfx.breach();
    else if (fx.ev === "step") sfx.relay();
    else if (fx.ev === "flare") (sfx.click(), noise(0.6, 900, 0.8, 0.5, "lowpass"));
    else if (fx.ev === "out") sfx.chime();
  },
  davitsArmed: (fx) => (fx.k === "davitsArmed" && fx.armed ? sfx.clunk() : sfx.powerDown()),
  doorOpen: () => sfx.door(),
  abandonPulled: () => sfx.clunk(),
  rejected: () => sfx.reject(),
  phase: (fx) => {
    if (fx.k !== "phase") return;
    if (fx.phase === "POWER" || fx.phase === "FLOOD" || fx.phase === "RADIO" || fx.phase === "CASCADE" || fx.phase === "ESCAPE") sfx.chime();
    if (fx.phase === "FLOOD" || fx.phase === "RADIO" || fx.phase === "CASCADE" || fx.phase === "ESCAPE") sfx.stinger(actOf(fx.phase));
    if (fx.phase === "SURVIVED") sfx.success();
    if (fx.phase === "LOST") (sfx.failure(), sfx.groan(), sfx.door());
  },
};

/** Call once at startup. Audio begins after the first pointer/key gesture. */
/** One-shot sound cues for the cinematic bookends (scene/cinematic/timeline.ts). */
export function cinematicCue(cue: "horn" | "impact" | "thunder" | "splash" | "groan" | "alarm"): void {
  if (!ensure() || !started) return;
  switch (cue) {
    case "horn": // the other ship's whistle, distant and too late
      tone(98, 1.6, 0.12, "sawtooth", 0, 96);
      tone(147, 1.6, 0.07, "sawtooth", 0, 145);
      break;
    case "impact": // steel into steel: a deep thump, a tearing scrape, rivets going
      tone(42, 1.6, 0.6, "sine", 0, 28);
      noise(1.2, 120, 0.8, 0.9, "lowpass");
      noise(2.2, 900, 2, 0.35, "bandpass", 0.15);
      tone(260, 1.8, 0.06, "sawtooth", 0.2, 140);
      for (let i = 0; i < 5; i++) noise(0.05, 2600, 6, 0.25, "bandpass", 0.3 + i * 0.17 + Math.random() * 0.1);
      break;
    case "thunder":
      sfx.thunder();
      break;
    case "splash": // a sea breaking over the bow
      noise(1.4, 700, 0.6, 0.45, "lowpass");
      noise(0.9, 2400, 0.8, 0.12, "bandpass", 0.1);
      break;
    case "groan": // the hull working as she floods
      sfx.creak();
      tone(60, 2.4, 0.18, "sawtooth", 0.1, 44);
      break;
    case "alarm": // general alarm: seven short, one long
      for (let i = 0; i < 7; i++) tone(440, 0.22, 0.06, "square", i * 0.4);
      tone(440, 1.2, 0.06, "square", 2.9);
      break;
  }
}

export function initAudio(): void {
  if (started) return;
  started = true;
  // A touch pointerdown is not a user activation (only its pointerup is), so
  // phones would stay silent if the first touch removed these listeners.
  // Keep trying on every gesture until the context is actually running.
  const gestures = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
  let ticking = false;
  const unlock = () => {
    const c = ensure();
    if (!c) return;
    if (!ticking) {
      ticking = true;
      setInterval(loop, 450);
      setInterval(pulseTick, 25);
    }
    const done = () => {
      if (c.state === "running") for (const g of gestures) removeEventListener(g, unlock);
    };
    if (c.state === "suspended") void c.resume().then(done, () => {});
    else done();
  };
  for (const g of gestures) addEventListener(g, unlock);
  useStore.subscribe((s, prev) => {
    if (s.muted !== prev.muted || s.volume !== prev.volume) applyVolume();
    if (s.view !== prev.view) onViewChange(s.view, prev.view);
  });
  onFx((fx) => {
    if (ctx) FX_SOUND[fx.k]?.(fx);
  });
}

/** Local feedback for using any control (before the server answers). */
export function playUse(): void {
  if (ctx) sfx.click();
}
