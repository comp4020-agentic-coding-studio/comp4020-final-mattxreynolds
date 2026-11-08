// Water on the engine-room deck (and the Aux Machinery Room once its door is
// open: same compartment). Height tracks the authoritative ENGINE level
// (waterTarget). Shader water: scrolling-noise normals, fresnel-darkened
// depth, a fake lamp/ceiling reflection, a foam band at the room edge and
// (high quality) caustics on the floor beneath. Debris bobs on the surface.
// No render targets; reduced motion slows the surface right down.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  type InstancedMesh,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";
import { useStore } from "../../store.ts";
import { PALETTE } from "../palette.ts";
import { auxOpenNow } from "./AuxRoom.tsx";
import { kicks } from "./Effects.tsx";
import { ev, shipLive } from "./kit.tsx";
import { AUX_CX, AUX_CZ, AUX_D, AUX_W, ROOM } from "./layout.ts";

export const WATER_MAX_M = 0.6;
/** a lost compartment: deep, but the valve handwheels (1.05 m) stay clear */
export const WATER_LOST_M = 0.9;

/** Current (smoothed) surface height, shared with the particle system. */
export const waterNow = { h: 0.02 };

/** Target water height in metres from the current view. */
export function waterTarget(): number {
  const v = ev();
  if (!v) return 0;
  if (v.phase === "LOST") return 1.2;
  if (v.phase === "SURVIVED") return 0.03;
  if (v.ship.lost.ENGINE) return WATER_LOST_M;
  if (shipLive(v.phase)) return 0.03 + (Math.min(100, v.flood.engineLevel) / 100) * (WATER_MAX_M - 0.03);
  return 0.02 + (v.danger / 100) * 0.3;
}

const NOISE = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.03+7.1)*0.3 + vnoise(p*4.1+3.3)*0.15; }
`;

const WATER_VERT = /* glsl */ `
varying vec3 vW; varying vec2 vL;
void main(){
  vL = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
uniform float uTime, uAlpha, uDanger, uLight, uSpeed;
uniform vec2 uHalf; uniform vec3 uDeep, uShallow;
varying vec3 vW; varying vec2 vL;
${NOISE}
float surf(vec2 p, float t){
  return fbm(p*1.6 + vec2(t*0.35, t*0.2)) + fbm(p*2.7 - vec2(t*0.25, -t*0.3))*0.6;
}
void main(){
  vec2 p = vW.xz;
  float t = uTime * uSpeed;
  float e = 0.06;
  float h0 = surf(p, t);
  float hx = surf(p + vec2(e, 0.), t);
  float hz = surf(p + vec2(0., e), t);
  vec3 n = normalize(vec3((h0-hx)*0.9, 1.0, (h0-hz)*0.9));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  vec3 R = reflect(-V, n);
  float lamp = pow(max(R.y, 0.0), 24.0) * uLight;
  vec3 sky = mix(vec3(0.05,0.08,0.1), vec3(0.22,0.3,0.34), clamp(R.y,0.,1.)) * (0.4 + 0.6*uLight);
  sky += vec3(0.12,0.0,0.0) * uDanger;
  vec3 col = mix(uDeep, uShallow, 0.35 + 0.4*h0);
  col = mix(col, sky, fres * 0.85) + vec3(1.0,0.85,0.6) * lamp * 0.9;
  vec2 d = uHalf - abs(vL);
  float edge = min(d.x, d.y);
  float band = 0.28 + 0.1*sin(t*1.3);
  float fn = fbm(p*5.0 + t*0.2);
  float foam = smoothstep(band, 0.0, edge + (fn-0.5)*0.18) * 0.9;
  foam += smoothstep(0.82, 0.95, fbm(p*3.0 - t*0.15)) * 0.25;
  col = mix(col, vec3(0.82,0.88,0.9) * (0.35+0.65*uLight), clamp(foam, 0.0, 1.0));
  float a = clamp(uAlpha + fres*0.3 + foam*0.4, 0.0, 0.95);
  gl_FragColor = vec4(col, a);
}`;

const CAUS_FRAG = /* glsl */ `
uniform float uTime, uAmt;
varying vec3 vW; varying vec2 vL;
void main(){
  vec2 q = vW.xz * 1.4;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(cos(uTime*0.7 + q.y*1.3 + fi*1.7), sin(uTime*0.6 + q.x*1.1 + fi*2.3)) * 0.6;
    c += 1.0 / max(0.18, length(vec2(sin(q.x*2.0), cos(q.y*2.0))));
  }
  c = pow(clamp(1.0 - abs(c/3.0 - 1.0), 0.0, 1.0), 6.0);
  float fl = 0.75 + 0.25*sin(uTime*9.0 + vW.x*2.0);
  gl_FragColor = vec4(vec3(0.35,0.7,0.8) * c * fl * uAmt, 1.0);
}`;

const DEBRIS_N = 14;

function waterMat(halfW: number, halfD: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0.5 },
      uDanger: { value: 0 },
      uLight: { value: 1 },
      uSpeed: { value: 1 },
      uHalf: { value: new Vector2(halfW, halfD) },
      uDeep: { value: new Color(PALETTE.water).multiplyScalar(0.35) },
      uShallow: { value: new Color(PALETTE.water).multiplyScalar(0.8) },
    },
  });
}

export function Water() {
  const ref = useRef<Mesh>(null);
  const aux = useRef<Mesh>(null);
  const caus = useRef<Mesh>(null);
  const causAux = useRef<Mesh>(null);
  const debris = useRef<InstancedMesh>(null);
  const h = useRef(0.02);
  const geo = useMemo(() => new PlaneGeometry(ROOM.w, ROOM.d), []);
  const auxGeo = useMemo(() => new PlaneGeometry(AUX_W + 0.3, AUX_D), []);
  const mats = useMemo(() => [waterMat(ROOM.w / 2, ROOM.d / 2), waterMat((AUX_W + 0.3) / 2, AUX_D / 2)], []);
  const causMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: CAUS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
      }),
    [],
  );
  const dGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const dMat = useMemo(() => new MeshStandardMaterial({ color: "#3a3226", roughness: 0.9 }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: DEBRIS_N }, (_, i) => ({
        x: ((i * 0.618) % 1) * 8 - 4,
        z: ((i * 0.377 + 0.2) % 1) * 6 - 3,
        s: 0.08 + ((i * 0.31) % 1) * 0.14,
        ph: i * 1.7,
        w: 0.2 + ((i * 0.53) % 1) * 0.4,
      })),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const mesh = ref.current;
    if (!mesh) return;
    const st = useStore.getState();
    const reduced = st.reducedMotion;
    h.current += (waterTarget() - h.current) * Math.min(1, dt * 0.8);
    waterNow.h = h.current;
    const auxOpen = auxOpenNow();
    const t = performance.now() / 1000;
    mesh.position.y = h.current;
    if (aux.current) {
      aux.current.position.y = h.current;
      aux.current.visible = auxOpen;
    }
    const danger = (st.view?.danger ?? 0) / 100;
    const light = Math.max(0.15, 1 - kicks.dip * 0.7);
    for (const m of mats) {
      const u = m.uniforms;
      u.uTime.value = t;
      u.uSpeed.value = reduced ? 0.25 : 1;
      u.uAlpha.value = 0.42 + Math.min(0.25, h.current * 0.5);
      u.uDanger.value = danger;
      u.uLight.value = light;
    }
    // caustics: shallow water only, fading as it deepens; none on "low"
    const amt = st.quality === "high" ? Math.max(0, Math.min(1, h.current * 6)) * Math.max(0, 1 - h.current * 0.9) * 0.55 * light : 0;
    causMat.uniforms.uTime.value = reduced ? 0 : t;
    causMat.uniforms.uAmt.value = amt;
    if (caus.current) caus.current.visible = amt > 0.01;
    if (causAux.current) causAux.current.visible = amt > 0.01 && auxOpen;
    const d = debris.current;
    if (d) {
      d.visible = h.current > 0.08;
      if (d.visible) {
        const sw = reduced ? 0 : 1;
        for (let i = 0; i < DEBRIS_N; i++) {
          const s = seeds[i];
          dummy.position.set(
            s.x + Math.sin(t * 0.13 * s.w + s.ph) * 0.8 * sw,
            h.current + Math.sin(t * 1.3 + s.ph) * 0.012 * sw,
            s.z + Math.cos(t * 0.11 * s.w + s.ph) * 0.6 * sw,
          );
          dummy.rotation.set(Math.sin(t * 0.7 + s.ph) * 0.1 * sw, s.ph + t * 0.05 * sw, Math.cos(t * 0.6 + s.ph) * 0.1 * sw);
          dummy.scale.set(s.s * 1.8, 0.03 + s.s * 0.2, s.s);
          dummy.updateMatrix();
          d.setMatrixAt(i, dummy.matrix);
        }
        d.instanceMatrix.needsUpdate = true;
      }
    }
  });

  const cx = AUX_CX + 0.15;
  return (
    <group>
      <mesh ref={ref} geometry={geo} material={mats[0]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null} renderOrder={2} />
      <mesh ref={aux} geometry={auxGeo} material={mats[1]} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.02, AUX_CZ]} raycast={() => null} renderOrder={2} visible={false} />
      <mesh ref={caus} geometry={geo} material={causMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} raycast={() => null} renderOrder={1} visible={false} />
      <mesh ref={causAux} geometry={auxGeo} material={causMat} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.006, AUX_CZ]} raycast={() => null} renderOrder={1} visible={false} />
      <instancedMesh ref={debris} args={[dGeo, dMat, DEBRIS_N]} frustumCulled={false} raycast={() => null} visible={false} />
    </group>
  );
}
