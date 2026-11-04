// Pooled, instanced soft-sprite particles (billboarded quads, one draw call
// per pool). Fixed budget, no allocation after construction. Used by
// engine/Effects.tsx (steam, spray, drips, smoke), fx/Atmosphere.tsx (dust)
// fx/BridgeDistress.tsx (deckhead drips) and the compartment-fire effects
// (engine/FireFx.tsx, bridge/FireFx.tsx).

import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

export type Particle = {
  alive: boolean;
  t: number;
  life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** size at birth / growth factor over life */
  s: number;
  grow: number;
  /** velocity damping per second, gravity (m/s², positive = falls) */
  drag: number;
  grav: number;
  r: number; g: number; b: number;
  /** peak alpha */
  a: number;
  /** dies below this height (or never when -Infinity) */
  floor: number;
  /** when it falls below `floor`, onLand fires (splash) */
  land: boolean;
  /** rises no higher than this (a deckhead): it stops and spreads (Infinity = none) */
  ceil: number;
};

const VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aSize;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vCol = aCol;
  vUv = uv;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += (uv - 0.5) * 2.0 * aSize;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec4 vCol;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

export class Pool {
  readonly n: number;
  readonly parts: Particle[];
  readonly mesh: InstancedMesh;
  private next = 0;
  onLand: ((p: Particle) => void) | null = null;
  private col: InstancedBufferAttribute;
  private size: InstancedBufferAttribute;
  private m: Float32Array;

  constructor(n: number, additive = false) {
    this.n = n;
    this.parts = Array.from({ length: n }, () => ({
      alive: false, t: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, grow: 1,
      drag: 0, grav: 0, r: 1, g: 1, b: 1, a: 1, floor: -Infinity, land: false, ceil: Infinity,
    }));
    const geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    geo.setAttribute("uv", quad.attributes.uv);
    this.col = new InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(DynamicDrawUsage);
    this.size = new InstancedBufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    geo.setAttribute("aCol", this.col);
    geo.setAttribute("aSize", this.size);
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    // InstancedMesh wants an InstancedBufferGeometry-compatible geometry
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => null;
    this.mesh.renderOrder = 4;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.m = this.mesh.instanceMatrix.array as Float32Array;
    // identity matrices; only the translation (elements 12..14) changes
    for (let i = 0; i < n; i++) {
      this.m[i * 16] = this.m[i * 16 + 5] = this.m[i * 16 + 10] = this.m[i * 16 + 15] = 1;
    }
  }

  /** Claim the next slot (oldest is recycled when the pool is full). */
  spawn(): Particle {
    const p = this.parts[this.next++ % this.n];
    p.alive = true;
    p.t = 0;
    p.drag = 0;
    p.grav = 0;
    p.grow = 1;
    p.a = 1;
    p.floor = -Infinity;
    p.land = false;
    p.ceil = Infinity;
    return p;
  }

  /** Scale every live particle's alpha by `k` (e.g. smoke clearing). */
  fade(k: number): void {
    for (const p of this.parts) if (p.alive) p.a *= k;
  }

  get aliveCount(): number {
    let c = 0;
    for (const p of this.parts) if (p.alive) c++;
    return c;
  }

  update(dt: number): void {
    const { parts, m } = this;
    const ca = this.col.array as Float32Array;
    const sa = this.size.array as Float32Array;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.alive) {
        p.t += dt;
        if (p.t >= p.life) p.alive = false;
        else {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k; p.vz *= k;
          p.vy = p.vy * k - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y > p.ceil) {
            p.y = p.ceil;
            p.vy = 0;
          }
          if (p.y < p.floor) {
            p.alive = false;
            if (p.land) this.onLand?.(p);
          }
        }
      }
      if (!p.alive) {
        sa[i] = 0;
        continue;
      }
      const k = p.t / p.life;
      m[i * 16 + 12] = p.x; m[i * 16 + 13] = p.y; m[i * 16 + 14] = p.z;
      sa[i] = p.s * (1 + (p.grow - 1) * k);
      ca[i * 4] = p.r; ca[i * 4 + 1] = p.g; ca[i * 4 + 2] = p.b;
      ca[i * 4 + 3] = p.a * Math.min(1, p.t * 6) * (1 - k) * (1 - k * 0.3);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = true;
    this.size.needsUpdate = true;
  }
}

/** Shared motion inputs written by fx handlers, read by Player (camera). */
export const motion = { jolt: 0, shake: 0 };
