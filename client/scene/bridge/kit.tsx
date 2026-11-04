// Reusable Bridge building blocks: shared materials/geometries, a powered
// screen with boot/flicker/flash effects, text plates, lamps and an
// animated-canvas hook. Effects are driven in useFrame from refs and the fx
// clock (state.ts), never from per-frame React state.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import { SHIP_PHASES, type Fx } from "../../../shared/protocol.ts";
import { useStore } from "../../store.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import type { Glyph } from "../../../shared/glyphs.ts";
import { MONO, roundel } from "./draw.ts";
import { fxClock, navView, nowS } from "./state.ts";
import { dressStd as dress } from "../look/surfaces.ts";
// unit tests import this module without a DOM: skip the canvas-built relief there
const dressStd: typeof dress = (m, ...a) => (typeof document === "undefined" ? m : dress(m, ...a));

// ------------------------------------------------------------ shared assets

export const GEO = {
  box: new BoxGeometry(1, 1, 1),
  plane: new PlaneGeometry(1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 32),
  cyl12: new CylinderGeometry(1, 1, 1, 12),
  sphere: new SphereGeometry(1, 20, 14),
};

const std = (color: string, roughness = 0.7, metalness = 0.1) => new MeshStandardMaterial({ color, roughness, metalness });

export const MAT = {
  bulkhead: dressStd(std(PALETTE.bulkhead, 0.75, 0.25), "paint", [3, 2], 0.8),
  bulkheadDark: std(PALETTE.bulkheadDark, 0.8, 0.25),
  bulkheadLow: std(PALETTE.bulkheadLow, 0.85, 0.2),
  deck: dressStd(std(PALETTE.deck, 0.9, 0.35), "tread", [6, 6], 1.2),
  deckPlate: std(PALETTE.deckPlate, 0.6, 0.4),
  ceiling: std(PALETTE.ceiling, 0.9, 0.1),
  console: dressStd(std("#2c3639", 0.55, 0.35), "paint", [2, 2], 0.5),
  consoleDark: std("#1d2427", 0.5, 0.4),
  bezel: std("#15191b", 0.45, 0.5),
  brass: std(PALETTE.brass, 0.35, 0.8),
  brassDark: std(PALETTE.brassDark, 0.45, 0.7),
  enamel: std(PALETTE.enamel, 0.4, 0.2),
  pipe: std(PALETTE.pipe, 0.6, 0.6),
  wood: std(PALETTE.wood, 0.65, 0.05),
  rubber: std("#151515", 0.95, 0),
  chrome: std("#9aa4a8", 0.25, 0.9),
};

// ------------------------------------------------------------ helpers

/** Box mesh with shared geometry: position + size (+ optional rotation). */
export function Block(props: {
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  m: MeshStandardMaterial;
}) {
  return <mesh geometry={GEO.box} material={props.m} position={props.p} scale={props.s} rotation={props.r} />;
}

/** A canvas texture that redraws in useFrame at most `fps` times/s (for small
 * animated displays like the waveform). `draw` reads live data itself. */
export function useAnimatedCanvas(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void,
  fps = 10,
  /** false: draw once and stop (dead / standby screens never change) */
  animate = true,
): CanvasTexture {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, [width, height]);
  const last = useRef(-1);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const animRef = useRef(animate);
  if (animRef.current !== animate) last.current = -1; // redraw once on a mode change
  animRef.current = animate;
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const t = nowS();
    if (t - last.current < 1 / fps || (!animRef.current && last.current >= 0)) return;
    last.current = t;
    const ctx = canvas.getContext("2d")!;
    drawRef.current(ctx, width, height, t);
    texture.needsUpdate = true;
  });
  return texture;
}

/** Brightness envelope for a powered display at time t (seconds). */
function screenBrightness(t: number, delay: number, flashOn: readonly Fx["k"][], reduced: boolean): { b: number; sweep: number } {
  let b = 1;
  let sweep = -1;
  // boot: dark, a flicker or two, then a scanline sweep top → bottom
  const boot = fxClock.busOn === undefined ? Infinity : t - fxClock.busOn - delay;
  if (boot < 0) b = 0.04;
  else if (boot < 1.1) {
    const k = boot / 1.1;
    sweep = k;
    b = reduced ? 0.3 + 0.7 * k : k < 0.15 ? (Math.sin(boot * 90) > 0 ? 0.6 : 0.1) : 0.35 + 0.65 * k;
  }
  // generator trip (Act I breakers or the later grid): consoles brown out and flicker
  const trip = Math.min(fxClock.trip === undefined ? Infinity : t - fxClock.trip, fxClock.gridTrip === undefined ? Infinity : t - fxClock.gridTrip);
  if (trip < 1.2) {
    if (reduced) b *= 0.45;
    else b *= 0.25 + 0.75 * (Math.sin(trip * 47 + delay * 13) * Math.sin(trip * 23) > 0.1 ? 1 : 0.15) * Math.min(1, trip / 1.2 + 0.2);
  }
  // grid down: the Bridge runs on its own emergency battery — readable, dimmer
  const v = navView();
  if (v && v.ship.gridDown && SHIP_PHASES.includes(v.phase)) b *= 0.62;
  // power online: a single bright pulse as the generator takes the load
  // (or the grid comes back after a trip)
  const lastOn = Math.max(fxClock.powerOnline ?? -Infinity, fxClock.gridReset ?? -Infinity);
  const on = lastOn === -Infinity ? Infinity : t - lastOn - delay * 0.5;
  if (on >= 0 && on < 0.8) b *= 1 + 0.35 * (1 - on / 0.8);
  for (const k of flashOn) {
    const f = fxClock[k] === undefined ? Infinity : t - fxClock[k]!;
    if (f < 1.6) b *= reduced ? 1.15 : 1 + 0.5 * Math.max(0, Math.cos(f * Math.PI * 4)) * (1 - f / 1.6);
  }
  return { b, sweep };
}

/**
 * A console screen: bezel + emissive (unlit, fog-free) display that boots with
 * a sweep on busOn, flickers on generator trips and can flash on given fx.
 * `width`×`height` in metres; the texture should share that aspect ratio.
 */
export function Screen(props: {
  map: CanvasTexture;
  width: number;
  height: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  delay?: number;
  flashOn?: readonly Fx["k"][];
  bezel?: number;
}) {
  const { map, width, height, delay = 0, flashOn = [], bezel = 0.05 } = props;
  const mat = useRef<MeshBasicMaterial>(null);
  const bar = useRef<Mesh>(null);
  useFrame(() => {
    const { b, sweep } = screenBrightness(nowS(), delay, flashOn, useStore.getState().reducedMotion);
    mat.current?.color.setScalar(Math.min(1.25, b));
    if (bar.current) {
      bar.current.visible = sweep >= 0;
      bar.current.position.y = height / 2 - sweep * height;
    }
  });
  return (
    <group position={props.position} rotation={props.rotation}>
      <mesh geometry={GEO.box} material={MAT.bezel} position={[0, 0, -0.035]} scale={[width + bezel * 2, height + bezel * 2, 0.06]} />
      <mesh geometry={GEO.plane} scale={[width, height, 1]}>
        <meshBasicMaterial ref={mat} map={map} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={bar} geometry={GEO.plane} position={[0, 0, 0.003]} scale={[width, height * 0.05, 1]} visible={false}>
        <meshBasicMaterial color="#c8ffe0" transparent opacity={0.55} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A flat self-lit text plate (stencil style), redrawn only when text changes. */
export function Plate(props: {
  text: string;
  width: number;
  height: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  bg?: string;
  fg?: string;
  border?: string;
  px?: number;
  res?: number;
}) {
  const { text, width, height, bg = PALETTE.plateBg, fg = PALETTE.plateText, border, res = 512 } = props;
  const tw = res;
  const th = Math.round((res * height) / width);
  const map = useCanvasTexture(
    tw,
    th,
    (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (border) {
        const lw = Math.max(4, Math.min(w, h) * 0.05);
        ctx.strokeStyle = border;
        ctx.lineWidth = lw;
        ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
      }
      const lines = text.split("\n");
      let px = props.px ? props.px * (tw / 512) : Math.floor((h / (lines.length + 0.5)) * 0.7);
      ctx.font = `bold ${px}px ${MONO}`;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest > w * 0.9) px = Math.floor((px * w * 0.9) / widest);
      ctx.font = `bold ${px}px ${MONO}`;
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lh = px * 1.25;
      const top = h / 2 - (lh * (lines.length - 1)) / 2;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, top + i * lh));
      // rivets in the corners
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      const rr = Math.max(3, h * 0.035);
      for (const [x, y] of [[rr * 2.5, rr * 2.5], [w - rr * 2.5, rr * 2.5], [rr * 2.5, h - rr * 2.5], [w - rr * 2.5, h - rr * 2.5]]) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [text, bg, fg, border, props.px],
  );
  return (
    <mesh geometry={GEO.plane} position={props.position} rotation={props.rotation} scale={[width, height, 1]}>
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}

/** Indicator lamp: a dome that glows when `on`, in a brass bezel. The label
 * next to it carries the state in words, so colour is never the only signal.
 * `blink` makes a lit lamp pulse (steady under reduced motion). */
export function Lamp(props: {
  on: boolean;
  color?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  r?: number;
  blink?: boolean;
}) {
  const { on, color = PALETTE.lampGreen, r = 0.035, blink = false } = props;
  const mat = useMemo(() => new MeshStandardMaterial({ color: PALETTE.lampOff, emissive: color, emissiveIntensity: 0, roughness: 0.3 }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  const live = useRef({ on, blink });
  live.current = { on, blink };
  useFrame(() => {
    const { on: lit, blink: bl } = live.current;
    let k = lit ? 2.4 : 0;
    if (lit && bl && !useStore.getState().reducedMotion) k *= Math.sin(nowS() * 7) > 0 ? 1 : 0.2;
    mat.emissiveIntensity = k;
    mat.color.set(lit ? color : PALETTE.lampOff);
  });
  return (
    <group position={props.position} rotation={props.rotation}>
      <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} scale={[r * 1.45, 0.02, r * 1.45]} />
      <mesh geometry={GEO.sphere} material={mat} position={[0, 0, 0.012]} scale={[r, r, r * 0.8]} />
    </group>
  );
}

/** Mounts its children only after `after` ms. The Bridge stages its stations
 * this way so the first mount (canvas draws, texture uploads, shader
 * compiles) is spread over several short tasks instead of one long one that
 * would hold up socket messages — e.g. the prologue's busOn — on slow GPUs. */
export function Staged({ after, children }: { after: number; children: ReactNode }) {
  const [ready, setReady] = useState(after <= 0);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), after);
    return () => clearTimeout(t);
  }, [after, ready]);
  return ready ? <Warm>{children}</Warm> : null;
}

/** Keeps its subtree hidden until three.js has compiled its shader programs
 * asynchronously (KHR_parallel_shader_compile where available), so first
 * appearance doesn't stall the main thread on a synchronous link. */
export function Warm({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    let live = true;
    // compileAsync needs the objects visible to traverse them; it does not draw
    gl.compileAsync(g, camera, scene)
      .catch(() => undefined)
      .then(() => {
        if (live && ref.current) ref.current.visible = true;
      });
    g.visible = false;
    return () => void (live = false);
  }, [gl, camera, scene]);
  return <group ref={ref}>{children}</group>;
}

/** Group that tilts its children like a sloped console control strip. */
export function Slope(props: { position: [number, number, number]; angle: number; children: ReactNode }) {
  return (
    <group position={props.position} rotation={[-Math.PI / 2 + props.angle, 0, 0]}>
      {props.children}
    </group>
  );
}

// ------------------------------------------------------------ console cabinet

export const DESK = { h: 0.9, d: 0.8, slopeD: 0.42, angle: 0.38, riserD: 0.14 } as const;
/** Centre of the sloped control strip, in console-local coordinates. */
export const SLOPE_AT: [number, number, number] = [
  0,
  DESK.h + Math.sin(DESK.angle) * (DESK.slopeD / 2) + 0.03,
  DESK.d / 2 - Math.cos(DESK.angle) * (DESK.slopeD / 2),
];
/** z of the riser's front face (screens mount here). */
export const RISER_Z = -DESK.d / 2 + DESK.riserD + 0.006;

/** A bridge console: cabinet, sloped control strip and an upright screen
 * riser of height `riserH`. Local origin = floor, centre; faces +Z. */
export function ConsoleBody({ w, riserH = 1.0, children }: { w: number; riserH?: number; children?: ReactNode }) {
  const slopeLen = DESK.slopeD / Math.cos(DESK.angle);
  return (
    <group>
      <Block p={[0, DESK.h / 2, 0]} s={[w, DESK.h, DESK.d]} m={MAT.console} />
      <Block p={[0, 0.05, DESK.d / 2 - 0.02]} s={[w - 0.04, 0.1, 0.06]} m={MAT.rubber} />
      {/* sloped strip */}
      <group position={[0, SLOPE_AT[1] - 0.03, SLOPE_AT[2]]} rotation={[DESK.angle, 0, 0]}>
        <Block p={[0, 0, 0]} s={[w, 0.05, slopeLen]} m={MAT.consoleDark} />
        <Block p={[0, 0.02, slopeLen / 2 - 0.015]} s={[w + 0.02, 0.05, 0.03]} m={MAT.brassDark} />
      </group>
      {/* riser */}
      <Block p={[0, DESK.h + riserH / 2, -DESK.d / 2 + DESK.riserD / 2]} s={[w, riserH, DESK.riserD]} m={MAT.console} />
      <Block p={[0, DESK.h + riserH + 0.02, -DESK.d / 2 + DESK.riserD / 2 + 0.02]} s={[w + 0.04, 0.04, DESK.riserD + 0.08]} m={MAT.consoleDark} />
      {children}
    </group>
  );
}

/** Local "press" animation clock for buttons: call press() on use, read
 * depth(t) in useFrame. Purely cosmetic and instantaneous (feedback before
 * the server answers). */
export function usePress() {
  const at = useRef(-10);
  return {
    press: () => void (at.current = nowS()),
    depth: () => {
      const d = nowS() - at.current;
      return d < 0.25 ? Math.sin((d / 0.25) * Math.PI) : 0;
    },
  };
}

/** A round push button (cap faces local +Z) in a brass bezel. `lit` makes the
 * cap glow; `depth` (from usePress) gives an instant local depress. */
export function PushButton(props: { color: string; r?: number; lit?: boolean; blink?: boolean; depth?: () => number; held?: boolean }) {
  const { color, r = 0.05, lit = false, blink = false, depth, held = false } = props;
  const cap = useRef<Mesh>(null);
  const mat = useMemo(() => new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.35 }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  const live = useRef({ lit, blink, held });
  live.current = { lit, blink, held };
  useFrame(() => {
    const { lit: l, blink: b, held: h } = live.current;
    let k = l ? 0.9 : 0.05;
    if (l && b && !useStore.getState().reducedMotion) k *= 0.35 + 0.65 * (Math.sin(nowS() * 6) > 0 ? 1 : 0);
    mat.emissiveIntensity = k;
    if (cap.current) cap.current.position.z = 0.03 - (h ? 0.015 : 0) - (depth ? depth() * 0.015 : 0);
  });
  return (
    <group>
      <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.008]} scale={[r * 1.35, 0.016, r * 1.35]} />
      <mesh geometry={GEO.cyl} material={MAT.enamel} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016]} scale={[r * 1.12, 0.012, r * 1.12]} />
      <mesh ref={cap} geometry={GEO.cyl} material={mat} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]} scale={[r, 0.035, r]} />
    </group>
  );
}

/** A canvas glyph roundel plate (cream on dark), redrawn only if the glyph changes. */
export function GlyphPlate(props: { glyph: Glyph | null; size: number; position?: [number, number, number]; dim?: boolean }) {
  const { glyph, size, dim = false } = props;
  const map = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.plateBg;
      ctx.fillRect(0, 0, w, h);
      if (glyph) roundel(ctx, glyph, w / 2, h / 2, w * 0.42, { ring: PALETTE.brass, bg: dim ? "#8b8678" : PALETTE.dialFace });
    },
    [glyph, dim],
  );
  return (
    <mesh geometry={GEO.plane} position={props.position} scale={[size, size, 1]}>
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}
