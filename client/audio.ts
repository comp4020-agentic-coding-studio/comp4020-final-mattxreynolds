// Procedural WebAudio: no audio files. Starts on the first user gesture
// (autoplay policy), respects mute/volume, and never carries information
// that isn't also shown visually (CLAUDE.md invariant 8 / GAME_DESIGN.md).

import type { Fx, View } from "../shared/protocol.ts";
import { onFx, useStore } from "./store.ts";

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let rumble: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let alarm: { gain: GainNode; osc: OscillatorNode } | null = null;
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
  },
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
  beep: (long: boolean) => tone(880, long ? 0.6 : 0.2, 0.12, "sine"),
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
  const phase = view?.phase;
  const playing = phase && phase !== "LOBBY" && phase !== "SURVIVED" && phase !== "LOST";
  const danger = view?.danger ?? 0;
  const engine = view?.you === "ENGINEER";
  const powered = phase !== "PROLOGUE" && phase !== "POWER";
  rumble.gain.gain.setTargetAtTime(playing ? (engine ? (powered ? 0.5 : 0.25) : 0.15) : 0, t, 0.5);
  rumble.filter.frequency.setTargetAtTime(powered ? 160 : 90, t, 0.5);
  const alarmOn = playing && (phase === "PROLOGUE" ? !view!.prologue.acknowledged : danger >= 75);
  alarm.gain.gain.setTargetAtTime(alarmOn ? 0.035 : 0, t, 0.05);
}

let alarmPhase = 0;
let lastGroan = 0;
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
  if (view && view.phase !== "LOBBY" && danger > 20 && now - lastGroan > 9000 - danger * 50 && Math.random() < 0.3) {
    lastGroan = now;
    sfx.groan();
  }
}

const FX_SOUND: Partial<Record<Fx["k"], (fx: Fx) => void>> = {
  busOn: () => (sfx.relay(), sfx.powerUp()),
  ack: () => sfx.relay(),
  trip: () => sfx.spark(),
  powerOnline: () => (sfx.powerUp(), sfx.success()),
  burst: () => sfx.steam(),
  floodStable: () => sfx.success(),
  arc: () => sfx.spark(),
  coupled: () => sfx.hum(),
  reply: (fx) => {
    sfx.static();
    if (fx.k === "reply") (fx.result === "contact" ? sfx.success : sfx.wrong)();
  },
  vent: () => sfx.steam(),
  doorOpen: () => sfx.door(),
  abandonPulled: () => sfx.clunk(),
  rejected: () => sfx.reject(),
  phase: (fx) => {
    if (fx.k !== "phase") return;
    if (fx.phase === "SURVIVED") sfx.success();
    if (fx.phase === "LOST") (sfx.groan(), sfx.door());
  },
};

/** Call once at startup. Audio begins after the first pointer/key gesture. */
export function initAudio(): void {
  if (started) return;
  started = true;
  const unlock = () => {
    const c = ensure();
    if (c?.state === "suspended") void c.resume();
    if (c) {
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
      setInterval(loop, 450);
    }
  };
  addEventListener("pointerdown", unlock);
  addEventListener("keydown", unlock);
  useStore.subscribe((s, prev) => {
    if (s.muted !== prev.muted || s.volume !== prev.volume) applyVolume();
  });
  onFx((fx) => {
    if (ctx) FX_SOUND[fx.k]?.(fx);
  });
}

/** Local feedback for using any control (before the server answers). */
export function playUse(): void {
  if (ctx) sfx.click();
}
