// Shaders and materials shared by every cinematic mount. Module-level, so a
// second cinematic in the same canvas reuses compiled programs. The `low`
// quality tier swaps the standard (PBR) materials for Lambert ones, which a
// CPU rasteriser links far faster (ADR 007).

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";

/** [dirX, dirZ, amplitude, wavenumber, speed] */
export const WAVES: [number, number, number, number, number][] = [
  [0.96, 0.28, 0.62, 0.15, 0.85],
  [0.37, 0.93, 0.38, 0.26, 1.15],
  [-0.76, 0.65, 0.2, 0.52, 1.8],
  [0.91, -0.41, 0.09, 1.15, 2.7],
];
const GLSL_WAVES = WAVES.map((w) => `vec4(${w.map((n) => n.toFixed(3)).slice(0, 4).join(",")})`).join(",");
const GLSL_SPEEDS = WAVES.map((w) => w[4].toFixed(3)).join(",");
export const SEA_Y = -0.8;

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

/** The sky's colour model, shared so the sea reflects the same sky. */
const SKY_FN = /* glsl */ `
  uniform float dawn, flash;
  uniform vec3 flashDir, glowDir;
  vec3 skyCol(vec3 d) {
    float h = d.y;
    float toward = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), glowDir), 0.0), 3.0);
    // a pale band at the horizon so a ship reads in silhouette against it
    vec3 night = vec3(0.1, 0.13, 0.16) + vec3(0.1, 0.11, 0.12) * toward;
    vec3 morn = mix(vec3(0.46, 0.44, 0.45), vec3(0.92, 0.66, 0.46), toward);
    vec3 horizon = mix(night, morn, dawn);
    vec3 zenith = mix(vec3(0.012, 0.016, 0.026), vec3(0.16, 0.2, 0.28), dawn);
    vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.3, h));
    return c;
  }
`;

export const sea = new ShaderMaterial({
  uniforms: {
    t: { value: 0 },
    swell: { value: 1 },
    flash: { value: 0 },
    flashDir: { value: new Vector3(0, 0.5, -1).normalize() },
    glowDir: { value: new Vector3(0.6, 0, -0.8).normalize() },
    shipPos: { value: new Vector3() },
    shipLight: { value: 1 },
    shipRed: { value: 0 },
    wash: { value: 0 },
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
        shift -= 0.55 * a * W[i].xy * cos(ph);
      }
      p.xz += shift;
      p.y += h;
      vW = p;
      vH = h / max(swell, 0.01);
      vN = normalize(vec3(-dx, 1.0, -dz));
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float t, shipLight, shipRed, wash;
    uniform vec3 shipPos, fogC;
    varying vec3 vW;
    varying vec3 vN;
    varying float vH;
    ${NOISE}
    ${SKY_FN}
    void main() {
      vec2 q = vW.xz;
      // ripples calm as the storm breaks, so dawn water reads smooth, not mottled
      float chop = 0.45 * (1.0 - dawn * 0.6);
      vec3 n = normalize(vN + vec3(noise(q * 1.7 + t * 0.7) - 0.5, 0.0, noise(q * 1.5 - t * 0.6) - 0.5) * chop);
      vec3 v = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
      vec3 r = reflect(-v, n);
      r.y = max(r.y, 0.02);
      vec3 c = vec3(0.008, 0.03, 0.042) + vec3(0.02, 0.085, 0.09) * smoothstep(-0.3, 1.2, vH);
      // dawn: a grey-blue body of water, lifted evenly
      c = mix(c, vec3(0.13, 0.17, 0.2) + vec3(0.03, 0.05, 0.06) * smoothstep(-0.3, 1.2, vH), dawn * 0.85);
      vec3 sk = skyCol(r);
      // the reflected dawn sky, desaturated toward grey: no orange leopard-print
      sk = mix(sk, vec3(dot(sk, vec3(0.3, 0.45, 0.25))) * vec3(0.9, 0.95, 1.05), dawn * 0.75);
      c = mix(c, sk + flash * vec3(0.5, 0.55, 0.65), (0.12 + 0.88 * fres) * (1.0 - dawn * 0.5));
      // a narrow sun path toward the glow on the horizon
      vec3 sunL = normalize(glowDir + vec3(0.0, 0.08, 0.0));
      float sunSpec = pow(max(dot(n, normalize(sunL + v)), 0.0), 220.0);
      c += vec3(1.0, 0.78, 0.55) * sunSpec * dawn * 1.4;
      float foam = smoothstep(0.55, 1.05, vH + fbm(q * 0.6 + t * 0.25) * 0.6 - 0.25);
      foam += smoothstep(0.72, 0.95, fbm(q * vec2(0.5, 2.2) + vec2(t * 0.4, 0.0))) * 0.35;
      vec2 rel = (q - shipPos.xz) * vec2(0.075, 0.3);
      foam += smoothstep(1.0, 0.55, length(rel)) * smoothstep(0.35, 0.75, fbm(q * 1.4 + t)) * 0.9;
      // white water boiling along the hull as the sea comes over the deck edge
      vec2 hb = abs(q - shipPos.xz) - vec2(11.0, 2.6 + wash * 1.2);
      float edge = length(max(hb, 0.0)) + min(max(hb.x, hb.y), 0.0);
      float wsh = wash * smoothstep(2.6, 0.2, abs(edge)) * smoothstep(0.3, 0.6, fbm(q * 2.6 + vec2(t * 1.3, -t * 0.9)));
      c = mix(c, vec3(0.42, 0.48, 0.5) * (0.6 + flash + dawn * 0.3), clamp(foam, 0.0, 1.0) * 0.55);
      // the wash is churned, aerated and lit by the ship's own lights
      c = mix(c, vec3(0.55, 0.6, 0.62) * (0.7 + flash) + vec3(0.9, 0.12, 0.06) * shipRed * 0.6, clamp(wsh, 0.0, 1.0) * 0.8);
      vec3 L = normalize(shipPos + vec3(0.0, 5.0, 0.0) - vW);
      float d = length(q - shipPos.xz);
      float glint = pow(max(dot(n, normalize(L + v)), 0.0), 60.0) * 2.5 / (1.0 + d * d * 0.012);
      c += (vec3(1.0, 0.72, 0.38) * shipLight + vec3(1.0, 0.08, 0.04) * shipRed) * glint;
      c += vec3(0.8, 0.86, 1.0) * pow(max(dot(n, normalize(flashDir + v)), 0.0), 30.0) * flash * 1.6 + flash * 0.05;
      float f = smoothstep(25.0, 190.0, length(vW - cameraPosition));
      gl_FragColor = vec4(mix(c, fogC + flash * 0.12, f), 1.0);
    }`,
});

export const sky = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    t: { value: 0 },
    flash: { value: 0 },
    flashDir: sea.uniforms.flashDir,
    glowDir: sea.uniforms.glowDir,
    dawn: sea.uniforms.dawn,
    cloud: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float t, cloud;
    varying vec3 vDir;
    ${NOISE}
    ${SKY_FN}
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 c = skyCol(d);
      vec2 uv = d.xz / (max(h, 0.0) + 0.12);
      float cl = fbm(uv * 0.9 + vec2(t * 0.03, t * 0.01));
      float cl2 = fbm(uv * 2.2 - vec2(t * 0.05, 0.0));
      float body = smoothstep(0.35, 0.8, cl * 0.7 + cl2 * 0.4) * cloud;
      vec3 shade = mix(vec3(0.012), vec3(0.3, 0.26, 0.26) * (0.5 + cl2), dawn);
      c = mix(c, c * 0.4 + shade, body * smoothstep(-0.02, 0.12, h));
      // lit edges in the dawn cloud
      c += dawn * vec3(1.0, 0.6, 0.35) * smoothstep(0.55, 0.75, cl2) * (1.0 - body) * 0.25 * smoothstep(0.0, 0.2, h);
      float near = pow(max(dot(d, flashDir), 0.0), 5.0);
      c += flash * (0.12 + near * 1.3) * vec3(0.62, 0.66, 0.8) * (0.35 + body + cl2 * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`,
});

/** Rain streaks that wrap around the camera: a box of falling lines, all in the shader. */
export const rain = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { t: { value: 0 }, density: { value: 1 }, flash: { value: 0 }, fall: { value: 1 }, tint: { value: new Color(0.68, 0.76, 0.84) } },
  vertexShader: /* glsl */ `
    attribute vec3 seed;
    attribute float tip;
    uniform float t, density, fall;
    varying float vA;
    void main() {
      vec3 box = vec3(40.0, 24.0, 40.0);
      vec3 vel = vec3(-7.0, -24.0, 3.0) * fall;
      vec3 p = seed * box + vel * t;
      p = mod(p - cameraPosition + box * 0.5, box) - box * 0.5 + cameraPosition;
      p += normalize(vel) * tip * 0.9;
      vA = step(fract(seed.x * 91.7 + seed.z * 13.3), density);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float flash;
    uniform vec3 tint;
    varying float vA;
    void main() {
      if (vA < 0.5) discard;
      gl_FragColor = vec4(tint * (0.5 + flash * 1.4), 0.2 + flash * 0.3);
    }`,
});

export function rainGeometry(n: number): BufferGeometry {
  const seed = new Float32Array(n * 6);
  const tip = new Float32Array(n * 2);
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const s = [rand(), rand(), rand()];
    seed.set([...s, ...s], i * 6);
    tip[i * 2 + 1] = 1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute("seed", new BufferAttribute(seed, 3));
  g.setAttribute("tip", new BufferAttribute(tip, 1));
  return g;
}

/** Spray: a burst of droplets thrown out and falling back, all in the shader. */
export const spray = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { age: { value: 99 }, origin: { value: new Vector3() }, side: { value: new Vector3(0, 0, 1) }, fwd: { value: new Vector3(1, 0, 0) }, power: { value: 1 }, light: { value: 0.5 }, px: { value: 600 } },
  vertexShader: /* glsl */ `
    attribute vec3 seed;
    uniform float age, power, px;
    uniform vec3 origin, side, fwd;
    varying float vA;
    void main() {
      float a = max(age - seed.z * 0.25, 0.0);
      float s = seed.x * 2.0 - 1.0;
      vec3 v = side * sign(s) * (2.0 + abs(s) * 5.0) * power + fwd * (seed.y - 0.3) * 3.0 * power + vec3(0.0, (3.0 + seed.y * 6.0) * power, 0.0);
      vec3 p = origin + v * a - vec3(0.0, 6.0 * a * a, 0.0) + vec3(-2.0, 0.0, 0.6) * a * a;
      vA = (age > seed.z * 0.25 ? 1.0 : 0.0) * clamp(1.0 - a / (0.9 + seed.y * 0.9), 0.0, 1.0);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (0.05 + seed.x * 0.09) * px / -mv.z * (1.0 + a * 0.6);
    }`,
  fragmentShader: /* glsl */ `
    uniform float light;
    varying float vA;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r = smoothstep(0.5, 0.1, length(c));
      gl_FragColor = vec4(vec3(0.8, 0.86, 0.9) * light, r * vA * 0.75);
    }`,
});

export function sprayGeometry(n: number): BufferGeometry {
  const seed = new Float32Array(n * 3);
  let r = 11;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * 3; i++) seed[i] = rand();
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("seed", new BufferAttribute(seed, 3));
  return g;
}

/** A soft round glow for lamps: bloom without a post pass. */
let haloTex: CanvasTexture | null = null;
export function halo(): CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (haloTex = new CanvasTexture(c));
}

type Surface = { color: string; roughness?: number; metalness?: number; vertexColors?: boolean; emissive?: string };
function pair(o: Surface): { high: Material; low: Material } {
  const base = { color: o.color, vertexColors: o.vertexColors ?? false, ...(o.emissive ? { emissive: new Color(o.emissive) } : {}) };
  return {
    high: new MeshStandardMaterial({ ...base, roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0.2 }),
    low: new MeshLambertMaterial(base),
  };
}

export const SURF = {
  hull: pair({ color: "#ffffff", vertexColors: true, roughness: 0.62, metalness: 0.35 }),
  house: pair({ color: "#d4d0c4", roughness: 0.6, metalness: 0.1 }),
  steel: pair({ color: "#3a4046", roughness: 0.5, metalness: 0.6 }),
  hatch: pair({ color: "#3f5a4c", roughness: 0.7, metalness: 0.3 }),
  funnel: pair({ color: "#c9c4b6", roughness: 0.6 }),
  band: pair({ color: "#b0261a", roughness: 0.5 }),
  black: pair({ color: "#141618", roughness: 0.8 }),
  boat: pair({ color: "#ff6a1a", roughness: 0.5, emissive: "#2a0a00" }),
  canopy: pair({ color: "#f0ebe0", roughness: 0.6 }),
  other: pair({ color: "#30302e", roughness: 0.6, metalness: 0.4 }),
  otherHouse: pair({ color: "#8a8478", roughness: 0.7 }),
};

/** Windows and portholes: unlit, coloured per instance each frame. */
export const paneMat = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
export const frameMat = new MeshBasicMaterial({ color: "#16191c" });
export const lineMat = new MeshBasicMaterial({ color: "#c8c2b2" });
export const boltMat = new MeshBasicMaterial({ color: "#eef3ff", transparent: true, side: DoubleSide, depthWrite: false, fog: false });
export const fadeMat = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
