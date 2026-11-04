// Cinematic bookends, procedural and cheap: a storm at night over a moving
// sea, with the ship riding it. Three shots share one small scene.
//   intro    — the ship pitches through the storm, a collision, the lights
//              fail, the red emergency strobe takes over (~22 s, skippable)
//   survived — the lifeboat pulls clear as the ship settles; the weather
//              eases and the horizon greys toward dawn (14 s)
//   lost     — the ship's lights die one by one as it lists and goes under (9 s)
// Motion is the camera, the waves, the hull and the lights. The ship's pitch
// and roll come from the same wave function the sea shader displaces by, so
// the hull rides the swell it sits in. Reduced motion: no lightning strobe,
// no camera shake, gentler swell, softer rain, and lights fade instead of
// flickering.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  type Fog,
  type Group,
  IcosahedronGeometry,
  type DirectionalLight,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type PointLight,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  type Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { useStore } from "../store.ts";

export type Shot = "intro" | "survived" | "lost";
export const SHOT_SECONDS: Record<Shot, number> = { intro: 22, survived: 14, lost: 9 };

/** Caption cards, timed in seconds from the start of the shot. */
export const CAPTIONS: Record<Shot, { at: number; until: number; text: string; big?: boolean }[]> = {
  intro: [
    { at: 0.8, until: 5.5, text: "MV KESTREL MERIDIAN · HALVARD COASTAL LINES", big: true },
    { at: 2.5, until: 7, text: "Bass Strait. 02:14. Heavy weather." },
    { at: 8.4, until: 12, text: "Collision — starboard bow" },
    { at: 13, until: 17, text: "Main power lost. The sea is coming in." },
    { at: 18, until: 22, text: "Two crew are still aboard.", big: true },
  ],
  survived: [
    { at: 1.5, until: 7, text: "The lifeboat drops clear.", big: true },
    { at: 7.5, until: 13.5, text: "Behind you, the Kestrel Meridian settles by the head." },
  ],
  lost: [{ at: 1, until: 8, text: "The lights go out below the waterline.", big: true }],
};

/** Lightning strikes per shot (seconds). The intro's second is the impact. */
const STRIKES: Record<Shot, number[]> = { intro: [3.2, 8.4, 11.6, 15.9, 19.6], survived: [2.4, 8.8], lost: [0.5, 3.6, 6.9] };

// ---- the sea: one wave function, shared by the shader and the hull ----------

/** [dirX, dirZ, amplitude, wavenumber, speed] */
const WAVES: [number, number, number, number, number][] = [
  [0.96, 0.28, 0.62, 0.15, 0.85],
  [0.37, 0.93, 0.38, 0.26, 1.15],
  [-0.76, 0.65, 0.2, 0.52, 1.8],
  [0.91, -0.41, 0.09, 1.15, 2.7],
];
const GLSL_WAVES = WAVES.map((w) => `vec4(${w.map((n) => n.toFixed(3)).slice(0, 4).join(",")})`).join(",");
const GLSL_SPEEDS = WAVES.map((w) => w[4].toFixed(3)).join(",");
const SEA_Y = -0.8;

/** Height of the sea surface above SEA_Y at (x, z), time t, swell scale s. */
export function waveHeight(x: number, z: number, t: number, s: number): number {
  let h = 0;
  for (const [dx, dz, a, k, sp] of WAVES) h += a * Math.sin(k * (dx * x + dz * z) - sp * t);
  return h * s;
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
`;

const sea = new ShaderMaterial({
  uniforms: {
    t: { value: 0 },
    swell: { value: 1 },
    flash: { value: 0 },
    flashDir: { value: new Vector3(0, 0.5, -1).normalize() },
    shipPos: { value: new Vector3() },
    shipLight: { value: 1 },
    dawn: { value: 0 },
    fogC: { value: new Color("#0a1218") },
  },
  vertexShader: /* glsl */ `
    uniform float t, swell;
    varying vec3 vW;
    varying vec3 vN;
    varying float vH;
    const vec4 W[4] = vec4[4](${GLSL_WAVES});
    const float S[4] = float[4](${GLSL_SPEEDS});
    void main() {
      vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
      float h = 0.0, dx = 0.0, dz = 0.0;
      vec2 shift = vec2(0.0);
      for (int i = 0; i < 4; i++) {
        float ph = W[i].w * dot(W[i].xy, p.xz) - S[i] * t;
        float a = W[i].z * swell;
        h += a * sin(ph);
        dx += a * W[i].w * W[i].x * cos(ph);
        dz += a * W[i].w * W[i].y * cos(ph);
        shift -= 0.55 * a * W[i].xy * cos(ph); // Gerstner: crests sharpen
      }
      p.xz += shift;
      p.y += h;
      vW = p;
      vH = h / max(swell, 0.01);
      vN = normalize(vec3(-dx, 1.0, -dz));
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float t, flash, shipLight, dawn;
    uniform vec3 flashDir, shipPos, fogC;
    varying vec3 vW;
    varying vec3 vN;
    varying float vH;
    ${NOISE}
    void main() {
      vec2 q = vW.xz;
      vec3 n = normalize(vN + vec3(noise(q * 1.7 + t * 0.7) - 0.5, 0.0, noise(q * 1.5 - t * 0.6) - 0.5) * 0.45);
      vec3 v = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
      vec3 r = reflect(-v, n);
      vec3 sky = mix(mix(vec3(0.07, 0.09, 0.11), vec3(0.3, 0.24, 0.22), dawn), vec3(0.015, 0.02, 0.03), smoothstep(0.0, 0.5, r.y));
      vec3 c = vec3(0.008, 0.03, 0.042) + vec3(0.02, 0.085, 0.09) * smoothstep(-0.3, 1.2, vH);
      c = mix(c, sky + flash * vec3(0.5, 0.55, 0.65), 0.12 + 0.88 * fres);
      // wind-torn foam on the crests and streaks across the swell
      float foam = smoothstep(0.55, 1.05, vH + fbm(q * 0.6 + t * 0.25) * 0.6 - 0.25);
      foam += smoothstep(0.72, 0.95, fbm(q * vec2(0.5, 2.2) + vec2(t * 0.4, 0.0))) * 0.35;
      // white water churned around the hull
      vec2 rel = (q - shipPos.xz) * vec2(0.085, 0.36);
      foam += smoothstep(1.0, 0.6, length(rel)) * smoothstep(0.35, 0.75, fbm(q * 1.4 + t)) * 0.8;
      c = mix(c, vec3(0.42, 0.48, 0.5) * (0.6 + flash), clamp(foam, 0.0, 1.0) * 0.55);
      // the ship's deck lights glitter in a path toward the camera
      vec3 L = normalize(shipPos + vec3(0.0, 5.0, 0.0) - vW);
      float d = length(q - shipPos.xz);
      c += vec3(1.0, 0.72, 0.38) * pow(max(dot(n, normalize(L + v)), 0.0), 60.0) * shipLight * 2.5 / (1.0 + d * d * 0.012);
      // lightning: a hard glint, and the whole sea lifts for an instant
      c += vec3(0.8, 0.86, 1.0) * pow(max(dot(n, normalize(flashDir + v)), 0.0), 30.0) * flash * 1.6 + flash * 0.05;
      float f = smoothstep(20.0, 150.0, length(vW - cameraPosition));
      gl_FragColor = vec4(mix(c, fogC + flash * 0.12, f), 1.0);
    }`,
});

const sky = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  uniforms: { t: { value: 0 }, flash: { value: 0 }, flashDir: { value: new Vector3(0, 0.5, -1).normalize() }, dawn: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float t, flash, dawn;
    uniform vec3 flashDir;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 horizon = mix(vec3(0.06, 0.08, 0.1), vec3(0.34, 0.25, 0.22), dawn);
      vec3 c = mix(horizon, mix(vec3(0.01, 0.014, 0.024), vec3(0.08, 0.09, 0.12), dawn), smoothstep(0.0, 0.55, h));
      // low storm cloud: dark bellies drifting downwind
      vec2 uv = d.xz / (max(h, 0.0) + 0.12);
      float cl = fbm(uv * 0.9 + vec2(t * 0.03, t * 0.01));
      float cl2 = fbm(uv * 2.2 - vec2(t * 0.05, 0.0));
      float body = smoothstep(0.35, 0.8, cl * 0.7 + cl2 * 0.4);
      c = mix(c, c * 0.45 + vec3(0.012), body * smoothstep(-0.05, 0.15, h));
      // a flash lights the cloud from inside, brightest around the bolt
      float near = pow(max(dot(d, flashDir), 0.0), 5.0);
      c += flash * (0.12 + near * 1.1) * vec3(0.62, 0.66, 0.8) * (0.35 + body + cl2 * 0.5);
      if (h < 0.0) c = mix(c, horizon * 0.8, smoothstep(0.0, -0.08, h));
      gl_FragColor = vec4(c, 1.0);
    }`,
});

/** Rain streaks that wrap around the camera: a box of falling lines, all in the shader. */
const rain = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { t: { value: 0 }, density: { value: 1 }, flash: { value: 0 }, fall: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute vec3 seed;
    attribute float tip;
    uniform float t, density, fall;
    varying float vA;
    void main() {
      vec3 box = vec3(46.0, 26.0, 46.0);
      vec3 vel = vec3(-7.0, -24.0, 3.0) * fall;
      vec3 p = seed * box + vel * t;
      p = mod(p - cameraPosition + box * 0.5, box) - box * 0.5 + cameraPosition;
      p += normalize(vel) * tip * 0.9;
      vA = step(fract(seed.x * 91.7 + seed.z * 13.3), density);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float flash;
    varying float vA;
    void main() {
      if (vA < 0.5) discard;
      gl_FragColor = vec4(vec3(0.68, 0.76, 0.84) * (0.5 + flash * 1.4), 0.22 + flash * 0.3);
    }`,
});

function rainGeometry(n: number): BufferGeometry {
  const seed = new Float32Array(n * 6);
  const tip = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    seed.set([...s, ...s], i * 6);
    tip[i * 2 + 1] = 1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute("seed", new BufferAttribute(seed, 3));
  g.setAttribute("tip", new BufferAttribute(tip, 1));
  g.boundingSphere = null;
  return g;
}

// ---- the ship -----------------------------------------------------------------

/** Hull in plan: square stern, parallel sides, a raked bow. Extruded upward. */
function hullGeometry(): ExtrudeGeometry {
  const s = new Shape();
  s.moveTo(-11, -2.3);
  s.lineTo(7, -2.3);
  s.quadraticCurveTo(11.5, -2, 13.5, 0);
  s.quadraticCurveTo(11.5, 2, 7, 2.3);
  s.lineTo(-11, 2.3);
  s.lineTo(-11.4, 0);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 3.6, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // extrusion runs up; shape y becomes -z
  g.translate(0, -1.7, 0);
  return g;
}

const hullMat = new MeshStandardMaterial({ color: "#1d2428", roughness: 0.75, metalness: 0.3 });
const bootMat = new MeshStandardMaterial({ color: "#5c1a14", roughness: 0.8 });
const deckMat = new MeshStandardMaterial({ color: "#33393a", roughness: 0.9 });
const houseMat = new MeshStandardMaterial({ color: "#9e998c", roughness: 0.7 });
const funnelMat = new MeshStandardMaterial({ color: "#7a2318", roughness: 0.6 });
const mastMat = new MeshStandardMaterial({ color: "#2a2f33", roughness: 0.6, metalness: 0.5 });
const portMat = new MeshBasicMaterial({ color: new Color("#ffcf7a") });
const windowMat = new MeshBasicMaterial({ color: new Color("#ffd790") });
const boatMat = new MeshStandardMaterial({ color: "#e0662c", roughness: 0.6, emissive: new Color("#3a1000") });
const canopyMat = new MeshStandardMaterial({ color: "#d9d2c0", roughness: 0.8 });
const rockMat = new MeshStandardMaterial({ color: "#3c454b", roughness: 0.55, metalness: 0.1, flatShading: true });
const boltMat = new MeshBasicMaterial({ color: "#eef3ff", transparent: true, side: DoubleSide, depthWrite: false, fog: false });
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 12);
const bulb = new SphereGeometry(0.16, 8, 6);

/** A soft round glow for lamps: bloom without a post pass. */
let haloTex: CanvasTexture | null = null;
function halo(): CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (haloTex = new CanvasTexture(c));
}

type Lamp = { pos: [number, number, number]; color: string; size: number; /** seconds into LOST when it dies */ dies: number; nav?: boolean };
/** Deck floods, accommodation lamps and the navigation lights (masthead white,
 * starboard green, port red, stern white); nav lights run on battery. */
const LAMPS: Lamp[] = [
  { pos: [5.6, 9.3, 0], color: "#fff6e0", size: 1.6, dies: 4.6, nav: true },
  { pos: [-7.4, 6.9, 2.0], color: "#5cff8a", size: 1.4, dies: 4.2, nav: true },
  { pos: [-7.4, 6.9, -2.0], color: "#ff4a3a", size: 1.4, dies: 4.2, nav: true },
  { pos: [-11.3, 2.6, 0], color: "#fff6e0", size: 1.1, dies: 3.9, nav: true },
  { pos: [9.5, 2.9, 1.6], color: "#ffd9a0", size: 2.2, dies: 1.1 },
  { pos: [3.5, 3.2, 1.9], color: "#ffd9a0", size: 2.2, dies: 1.6 },
  { pos: [-1.5, 3.2, 1.9], color: "#ffd9a0", size: 2.2, dies: 2.1 },
  { pos: [-4.6, 4.2, 1.95], color: "#ffd9a0", size: 1.8, dies: 2.6 },
  { pos: [-9.6, 4.2, 1.95], color: "#ffd9a0", size: 1.8, dies: 3.0 },
];
const PORTS = Array.from({ length: 12 }, (_, i) => -9.5 + i * 1.6);

/** Smooth 0→1 between a and b. */
const ramp = (t: number, a: number, b: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** A failing circuit: stutters, then holds dark. Reduced motion just fades. */
const failing = (t: number, at: number, now: number, reduced: boolean, salt: number): number => {
  if (t < at - 0.8) return 1;
  if (t > at) return 0;
  if (reduced) return (at - t) / 0.8;
  return Math.sin(now * (37 + salt * 11)) + Math.sin(now * (23 + salt * 5)) > 0.3 ? 0.9 : 0.08;
};

/** Brightness (0..1) of ship's light `i` (or the portholes, i = -1, at x). */
function lampLevel(shot: Shot, t: number, now: number, reduced: boolean, lamp: Lamp | null, x: number, salt: number): number {
  if (shot === "intro") {
    // main power fails after the collision; battery nav lights hold
    if (lamp?.nav) return 1;
    return failing(t, 12.2 + salt * 0.25, now, reduced, salt) * (t > 8.4 && t < 8.9 && !reduced ? 0.25 : 1);
  }
  if (shot === "survived") {
    if (lamp?.nav) return failing(t, 8 + salt * 0.6, now, reduced, salt);
    return 0.35 * failing(t, 4 + salt * 0.5, now, reduced, salt);
  }
  // lost: from the bow aft, the lights go as the water reaches them
  const dies = lamp ? lamp.dies : 0.9 + ((14 - x) / 24) * 2.6;
  return failing(t, dies, now, reduced, salt);
}

function Ship({ shot, start }: { shot: Shot; start: number }) {
  const hull = useMemo(hullGeometry, []);
  const lampMats = useMemo(() => LAMPS.map((l) => new SpriteMaterial({ map: halo(), color: l.color, blending: AdditiveBlending, depthWrite: false, transparent: true })), []);
  const bulbMats = useMemo(() => LAMPS.map((l) => new MeshBasicMaterial({ color: l.color })), []);
  const sprites = useRef<(Sprite | null)[]>([]);
  const ports = useRef<(Mesh | null)[]>([]);
  const deckA = useRef<PointLight>(null);
  const deckB = useRef<PointLight>(null);
  const emergency = useRef<PointLight>(null);
  const strobe = useRef<Sprite>(null);
  const strobeMat = useMemo(() => new SpriteMaterial({ map: halo(), color: "#ff2a1a", blending: AdditiveBlending, depthWrite: false, transparent: true }), []);
  useEffect(
    () => () => {
      hull.dispose();
      lampMats.forEach((m) => m.dispose());
      bulbMats.forEach((m) => m.dispose());
      strobeMat.dispose();
    },
    [hull, lampMats, bulbMats, strobeMat],
  );

  useFrame(() => {
    const now = performance.now() / 1000;
    const t = now - start;
    const reduced = useStore.getState().reducedMotion;
    let total = 0;
    LAMPS.forEach((l, i) => {
      const k = lampLevel(shot, t, now, reduced, l, l.pos[0], i);
      lampMats[i].opacity = k * 0.9;
      bulbMats[i].color.set(l.color).multiplyScalar(0.15 + 0.85 * k);
      const s = sprites.current[i];
      if (s) s.scale.setScalar(l.size * (0.6 + 0.4 * k));
      if (!l.nav) total += k;
    });
    let lit = 0;
    PORTS.forEach((x, i) => {
      const k = lampLevel(shot, t, now, reduced, null, x, i % 5);
      for (const side of [0, 1]) {
        const m = ports.current[i * 2 + side];
        if (m) m.visible = k > 0.3;
      }
      lit += k;
    });
    windowMat.color.setRGB(1, 0.84, 0.56).multiplyScalar(0.1 + 0.9 * lampLevel(shot, t, now, reduced, null, -7, 2));
    const deck = total / (LAMPS.length - 4);
    if (deckA.current) deckA.current.intensity = 26 * deck;
    if (deckB.current) deckB.current.intensity = 9 * deck;
    sea.uniforms.shipLight.value = Math.min(1, deck * 0.7 + (lit / PORTS.length) * 0.3);
    // the red emergency strobe: on once main power is gone, until the end
    const strobeOn = (shot === "intro" && t > 12.4) || (shot === "lost" && t > 1.4 && t < 6.6) || (shot === "survived" && t < 9);
    const pulse = reduced ? 0.6 : Math.sin(now * 6) > 0 ? 1 : 0.1;
    const e = strobeOn ? pulse : 0;
    if (emergency.current) emergency.current.intensity = e * 30;
    strobeMat.opacity = e;
    if (strobe.current) strobe.current.scale.setScalar(1.2 + e * 1.4);
  });

  return (
    <group>
      <mesh geometry={hull} material={hullMat} />
      {/* boot-top band at the waterline, and the deck */}
      <mesh geometry={box} material={bootMat} position={[-2.1, -0.35, 0]} scale={[18.4, 0.5, 4.66]} />
      <mesh geometry={box} material={deckMat} position={[-1.6, 1.92, 0]} scale={[18.8, 0.08, 4.5]} />
      {/* forecastle, cargo hatches, cranes */}
      <mesh geometry={box} material={hullMat} position={[9.4, 2.4, 0]} scale={[3, 1, 2.8]} />
      {[-1.5, 2, 5.5].map((x) => (
        <mesh key={x} geometry={box} material={deckMat} position={[x, 2.3, 0]} scale={[2.8, 0.7, 3.4]} />
      ))}
      {[0.2, 3.8].map((x) => (
        <group key={x} position={[x, 2, -1.4]}>
          <mesh geometry={cyl} material={mastMat} position={[0, 1.6, 0]} scale={[0.12, 3.2, 0.12]} />
          <mesh geometry={cyl} material={mastMat} position={[0.9, 2.9, 0.4]} rotation={[0.3, 0, -1.1]} scale={[0.07, 2.4, 0.07]} />
        </group>
      ))}
      {/* accommodation block aft, bridge deck, funnel, mast */}
      <mesh geometry={box} material={houseMat} position={[-7.4, 3.5, 0]} scale={[4.4, 3, 4]} />
      <mesh geometry={box} material={houseMat} position={[-7.1, 5.6, 0]} scale={[3.4, 1.3, 4.6]} />
      <mesh geometry={box} material={windowMat} position={[-5.39, 5.75, 0]} scale={[0.02, 0.45, 3.8]} />
      <mesh geometry={box} material={windowMat} position={[-7.1, 5.75, 2.31]} scale={[2.8, 0.4, 0.02]} />
      <mesh geometry={cyl} material={funnelMat} position={[-9.3, 6.3, 0]} scale={[0.85, 2.6, 0.85]} />
      <mesh geometry={cyl} material={hullMat} position={[-9.3, 7.7, 0]} scale={[0.88, 0.3, 0.88]} />
      <mesh geometry={cyl} material={mastMat} position={[5.6, 5.6, 0]} scale={[0.12, 7.4, 0.12]} />
      <mesh geometry={cyl} material={mastMat} position={[-7.4, 6.8, 0]} scale={[0.06, 1.6, 0.06]} />
      {/* portholes, both sides */}
      {PORTS.flatMap((x, i) =>
        [1, -1].map((side, j) => (
          <mesh
            key={`${x}${side}`}
            ref={(m) => void (ports.current[i * 2 + j] = m)}
            geometry={box}
            material={portMat}
            position={[x, 0.85, side * 2.31]}
            scale={[0.32, 0.28, 0.02]}
          />
        )),
      )}
      {LAMPS.map((l, i) => (
        <group key={i} position={l.pos}>
          <mesh geometry={bulb} material={bulbMats[i]} />
          <sprite ref={(s) => void (sprites.current[i] = s)} material={lampMats[i]} />
        </group>
      ))}
      <pointLight ref={deckA} position={[4, 4.2, 2.6]} distance={14} decay={1.6} color="#ffcf8a" />
      <pointLight ref={deckB} position={[-3.6, 3.4, 4.2]} distance={10} decay={1.8} color="#ffcf8a" />
      <pointLight ref={emergency} position={[-7.2, 7.4, 0]} intensity={0} distance={20} color="#ff3020" />
      <sprite ref={strobe} material={strobeMat} position={[-7.2, 7.5, 0]} />
    </group>
  );
}

/** A jagged bolt from cloud to sea, as a flat ribbon facing the camera. */
function boltGeometry(seed: number): BufferGeometry {
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const pts: number[] = [];
  const idx: number[] = [];
  const branch = (x: number, y: number, len: number, w: number, depth: number) => {
    let px = x;
    let py = y;
    const start = pts.length / 3;
    const steps = Math.round(len / 4);
    for (let i = 0; i <= steps; i++) {
      pts.push(px - w, py, 0, px + w, py, 0);
      if (i > 0) {
        const a = start + (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      if (depth < 2 && rand() < 0.12) branch(px, py, len * 0.35, w * 0.5, depth + 1);
      px += (rand() - 0.5) * 6;
      py -= 4;
    }
  };
  branch(0, 70, 74, 0.5, 0);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
  g.setIndex(idx);
  return g;
}

/** Flash envelope of one strike `dt` seconds after it began: a double flicker. */
const strikeEnvelope = (dt: number): number =>
  dt < 0 ? 0 : dt < 0.07 ? 1 : dt < 0.13 ? 0.25 : dt < 0.22 ? 0.9 : Math.exp(-(dt - 0.22) * 9);

/** The procedural exterior. `start` is performance.now()/1000 when the shot began. */
export function CinematicScene({ shot, start }: { shot: Shot; start: number }) {
  const { camera, scene } = useThree();
  const ship = useRef<Group>(null);
  const boat = useRef<Group>(null);
  const rock = useRef<Group>(null);
  const bolt = useRef<Mesh>(null);
  const flashLight = useRef<DirectionalLight>(null);
  const fog = useRef<Fog>(null);
  const seaGeo = useMemo(() => {
    const g = new PlaneGeometry(320, 320, 170, 170);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const skyGeo = useMemo(() => new SphereGeometry(220, 32, 16), []);
  const rainGeo = useMemo(() => rainGeometry(1800), []);
  const rockGeo = useMemo(() => new IcosahedronGeometry(3, 1), []);
  const bolts = useMemo(() => [1, 2, 3, 4].map(boltGeometry), []);
  const lastStrike = useRef(-1);
  const look = useMemo(() => new Vector3(), []);
  const fwd = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      seaGeo.dispose();
      skyGeo.dispose();
      rainGeo.dispose();
      rockGeo.dispose();
      bolts.forEach((b) => b.dispose());
    },
    [seaGeo, skyGeo, rainGeo, rockGeo, bolts],
  );

  useFrame((_, dt) => {
    const now = performance.now() / 1000;
    const t = now - start;
    const reduced = useStore.getState().reducedMotion;
    const swell = (reduced ? 0.6 : 1) * (shot === "survived" ? 1.15 - ramp(t, 3, 14) * 0.45 : shot === "lost" ? 1.1 : 1.25);
    const wt = sea.uniforms.t.value + dt;
    sea.uniforms.t.value = wt;
    sea.uniforms.swell.value = swell;
    sky.uniforms.t.value = wt;
    rain.uniforms.t.value = wt;
    rain.uniforms.fall.value = reduced ? 0.45 : 1;
    rain.uniforms.density.value = (reduced ? 0.4 : 1) * (shot === "survived" ? 1 - ramp(t, 4, 13) * 0.75 : 1);
    const dawn = shot === "survived" ? ramp(t, 5, 14) * 0.7 : 0;
    sea.uniforms.dawn.value = dawn;
    sky.uniforms.dawn.value = dawn;

    // the hull rides the swell: heave from the mean, pitch and roll from the slopes
    const s = ship.current!;
    let x = 0;
    let sink = 0;
    let list = 0;
    let trim = 0;
    if (shot === "intro") {
      x = -8 + t * 0.6;
      sink = ramp(t, 9, 22) * 0.8;
      list = ramp(t, 9, 22) * 0.07;
      trim = ramp(t, 9, 22) * 0.03;
    } else if (shot === "survived") {
      sink = 0.6 + ramp(t, 0, 14) * 3;
      list = -ramp(t, 0, 14) * 0.16;
      trim = ramp(t, 0, 14) * 0.15;
    } else {
      // lost: lists hard to starboard and goes down by the head
      sink = 0.4 + ramp(t, 1, 9) * 7.5;
      list = ramp(t, 0.5, 8) * 0.42;
      trim = ramp(t, 2, 9) * 0.22;
    }
    const hb = waveHeight(x + 10, 0, wt, swell);
    const hs = waveHeight(x - 10, 0, wt, swell);
    const hp = waveHeight(x, -2.5, wt, swell);
    const hst = waveHeight(x, 2.5, wt, swell);
    const damp = 0.55; // a 120 m hull doesn't follow every crest
    const hit = shot === "intro" && t > 8.4 ? Math.exp(-(t - 8.4) * 3) : 0;
    s.position.set(x, SEA_Y + ((hb + hs + hp + hst) / 4) * damp - sink, 0);
    s.rotation.set(Math.atan2(hst - hp, 5) * damp + list + hit * 0.1, 0, Math.atan2(hb - hs, 20) * damp - trim);
    sea.uniforms.shipPos.value.copy(s.position);

    // what the ship hit: a dark half-submerged shape off the starboard bow
    const r = rock.current!;
    r.visible = shot === "intro";
    if (r.visible) r.position.set(17, SEA_Y - 0.6 + waveHeight(17, 4, wt, swell) * 0.3, 4.2);

    const b = boat.current!;
    b.visible = shot === "survived";
    if (b.visible) {
      const bx = -2 + t * 0.9;
      const bz = 8 + t * 1.2;
      const h0 = waveHeight(bx, bz, wt, swell);
      b.position.set(bx, SEA_Y + h0 + 0.15, bz);
      b.rotation.set(Math.atan2(waveHeight(bx, bz + 1, wt, swell) - h0, 1) * 0.8, 0.6, -Math.atan2(waveHeight(bx + 1.5, bz, wt, swell) - h0, 1.5) * 0.8);
    }

    // camera
    if (shot === "intro") {
      // wide establishing → three-quarter on the bow for the impact → low and
      // back along the listing hull as the power dies
      const k1 = ramp(t, 0, 8);
      const k2 = ramp(t, 13, 21);
      camera.position.set(-30 + k1 * 26 - k2 * 16, 9 - k1 * 4.5 - k2 * 2.6, 27 - k1 * 7 + k2 * 2);
      look.set(s.position.x + 5 - k2 * 7, SEA_Y + 2 - k2 * 0.6, 0);
    } else if (shot === "survived") {
      // ride behind the lifeboat, looking back past it at the settling ship
      camera.position.set(b.position.x + 7 - t * 0.2, 2.6 + t * 0.1, b.position.z + 13 - t * 0.25);
      look.set(b.position.x * 0.45, 0.2, b.position.z * 0.45);
    } else {
      camera.position.set(-21 + t * 0.4, 3.6 - ramp(t, 2, 9) * 1.6, 23 - t * 0.3);
      look.set(0, 1 - ramp(t, 1, 9) * 3.5, 0);
    }
    // handheld: a little drift, and a kick on impact
    if (!reduced) {
      camera.position.x += Math.sin(now * 0.9) * 0.12 + hit * Math.sin(now * 60) * 0.35;
      camera.position.y += Math.sin(now * 1.3) * 0.1 + hit * Math.sin(now * 47) * 0.3;
    }
    // keep the lens above the swell
    camera.position.y = Math.max(camera.position.y, SEA_Y + waveHeight(camera.position.x, camera.position.z, wt, swell) + 0.8);
    camera.lookAt(look);

    // lightning
    let flash = 0;
    let strike = -1;
    STRIKES[shot].forEach((at, i) => {
      const e = strikeEnvelope(t - at);
      if (e > flash) {
        flash = e;
        strike = i;
      }
    });
    if (reduced) flash = Math.min(flash, 0.25); // a soft glow, never a strobe
    const bm = bolt.current!;
    if (strike >= 0 && strike !== lastStrike.current) {
      lastStrike.current = strike;
      // place the bolt far out, inside the frame, a little off-centre
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize().applyAxisAngle(new Vector3(0, 1, 0), [0.35, -0.3, 0.2, -0.4, 0.45][strike % 5]);
      bm.geometry = bolts[strike % bolts.length];
      bm.position.copy(camera.position).addScaledVector(fwd, 150);
      bm.position.y = -6;
      bm.lookAt(camera.position.x, bm.position.y, camera.position.z);
      sea.uniforms.flashDir.value.copy(fwd).setY(0.35).normalize();
      sky.uniforms.flashDir.value.copy(sea.uniforms.flashDir.value);
      flashLight.current?.position.copy(fwd).multiplyScalar(60).setY(50);
    }
    bm.visible = !reduced && flash > 0.2;
    boltMat.opacity = Math.min(1, flash * 1.3);
    sky.uniforms.flash.value = flash;
    sea.uniforms.flash.value = flash * 0.6;
    rain.uniforms.flash.value = flash;
    if (flashLight.current) flashLight.current.intensity = flash * 5;

    // the air: dawn lifts the murk a little
    const fogC = sea.uniforms.fogC.value as Color;
    fogC.setRGB(0.04 + dawn * 0.22, 0.07 + dawn * 0.15, 0.094 + dawn * 0.12);
    fog.current?.color.copy(fogC);
    (scene.background as Color | null)?.copy(fogC);
  });

  return (
    <>
      <color attach="background" args={["#0a1218"]} />
      <fog ref={fog} attach="fog" args={["#0a1218", 25, 150]} />
      <ambientLight intensity={0.2} color="#9fb3c4" />
      <hemisphereLight args={["#3a4a58", "#05080a", 0.5]} />
      <directionalLight position={[-20, 30, 10]} intensity={0.35} color="#8aa0b8" />
      <directionalLight ref={flashLight} position={[-30, 50, -40]} intensity={0} color="#dfe8ff" />
      <mesh geometry={skyGeo} material={sky} />
      <mesh geometry={seaGeo} material={sea} position={[0, SEA_Y, 0]} frustumCulled={false} />
      <lineSegments geometry={rainGeo} material={rain} frustumCulled={false} />
      <mesh ref={bolt} material={boltMat} visible={false} frustumCulled={false} />
      <group ref={ship}>
        <Ship shot={shot} start={start} />
      </group>
      <group ref={rock} visible={false}>
        <mesh geometry={rockGeo} material={rockMat} scale={[2.2, 1, 1.6]} rotation={[0.2, 0.6, 0.1]} />
      </group>
      <group ref={boat} visible={false}>
        <mesh geometry={box} material={boatMat} scale={[3, 0.7, 1.3]} />
        <mesh geometry={box} material={canopyMat} position={[0, 0.6, 0]} scale={[2.4, 0.55, 1.1]} />
        <mesh geometry={bulb} material={windowMat} position={[0, 1.05, 0]} />
        <BoatLamp />
      </group>
    </>
  );
}

function BoatLamp() {
  const mat = useMemo(() => new SpriteMaterial({ map: halo(), color: "#ffe2b0", blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <>
      <sprite material={mat} position={[0, 1.1, 0]} scale={2.4} />
      <pointLight position={[0.4, 2.2, 1.2]} intensity={4} distance={9} color="#ffd9a0" />
    </>
  );
}
