// The world outside the Bridge windows: a stormy night. Everything here is
// a handful of draw calls and no render targets:
//   sky dome (cloud shader) · sea (vertex-displaced shader plane with foam)
//   · foredeck, containers, mast and rails (pitching) · rain on the glass
//   and in the air (two shader planes).
// StormDriver advances the shared `storm` state once per frame (lightning,
// pitch/roll, intensity from act + danger) and honours reducedMotion.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, DoubleSide, type Group, MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, Shape, ShapeGeometry, ShaderMaterial, AdditiveBlending } from "three";
import { useStore } from "../../store.ts";
import { grade } from "../look/PostFX.tsx";
import { GEO } from "./kit.tsx";
import { Instanced, type Item } from "./inst.tsx";
import { nowS } from "./state.ts";
import { storm, stormTarget } from "./storm.ts";

const U = { uTime: { value: 0 }, uFlash: { value: 0 }, uLevel: { value: 0.4 } };

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;

// ------------------------------------------------------------ sky

const skyMat = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  fog: false,
  uniforms: U,
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uFlash, uLevel;
    varying vec3 vDir;
    ${NOISE}
    void main(){
      float h = clamp(vDir.y, -0.2, 1.0);
      vec3 horizon = vec3(0.07, 0.10, 0.12);
      vec3 high = vec3(0.008, 0.014, 0.024);
      vec3 c = mix(horizon, high, smoothstep(0.0, 0.35, h));
      // low scudding cloud: projected onto a plane, streaming past
      vec2 uv = vDir.xz / (vDir.y + 0.25) * 1.3;
      float n = fbm(uv * 0.9 + vec2(uTime * 0.035 * (0.6 + uLevel), uTime * 0.012));
      float n2 = vnoise(uv * 2.6 - vec2(uTime * 0.06, 0.0));
      float cloud = smoothstep(0.38, 0.72, n * 0.75 + n2 * 0.35) * smoothstep(-0.05, 0.1, h);
      vec3 cc = mix(vec3(0.012, 0.018, 0.026), vec3(0.075, 0.095, 0.115), n2);
      c = mix(c, cc, cloud * 0.9);
      // sea-glow at the horizon
      c += vec3(0.05, 0.07, 0.08) * (1.0 - smoothstep(0.0, 0.1, abs(h)));
      // lightning lights the cloud undersides and the whole sky
      c += vec3(0.5, 0.58, 0.75) * uFlash * (0.35 + cloud * 0.9) * smoothstep(-0.1, 0.3, h);
      gl_FragColor = vec4(c, 1.0);
    }`,
});

// ------------------------------------------------------------ sea

/** The ship's solid footprint in world xz as [cx, cz, halfX, halfZ] boxes the sea
 * is clamped beneath (Bridge + Comms; foredeck hull). Kept in sync with the room
 * bounds by spec/bridge-room.unit.test.ts. */
export const SHIP_FOOTPRINT: readonly (readonly [number, number, number, number])[] = [
  [2.45, -0.1, 7.65, 4.3],
  [0.0, -13.35, 4.8, 9.05],
];
const f = (b: readonly number[]) => `${b[0].toFixed(3)}, ${b[1].toFixed(3)}), vec2(${b[2].toFixed(3)}, ${b[3].toFixed(3)}`;

const seaMat = new ShaderMaterial({
  fog: false,
  uniforms: U,
  vertexShader: /* glsl */ `
    uniform float uTime, uLevel;
    varying float vH; varying vec3 vW; varying vec2 vP;
    // The ship's solid footprint in world xz: Bridge + Comms Room (x -5.2..10.1,
    // z -4.4..4.2) and the foredeck hull (x ±4.8, z -22.4..-4.3). The sea must
    // never rise through the room floor (y 0) or the foredeck (y 0.55): before
    // this mask the plane ran under the Bridge and storm crests (up to +1.3 m)
    // rose through the floor and sank again.
    float sdBox(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
    float shipDist(vec2 p){
      return min(sdBox(p, vec2(${f(SHIP_FOOTPRINT[0])}), sdBox(p, vec2(${f(SHIP_FOOTPRINT[1])}));
    }
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      float amp = 0.5 + uLevel * 1.1;
      float t = uTime;
      float x = w.x, z = w.z;
      float h = sin(x*0.16 + t*0.9)*0.6 + sin(z*0.21 - t*1.2 + x*0.05)*0.8
              + sin((x+z)*0.45 + t*1.9)*0.22 + sin(x*0.9 - z*0.7 + t*2.7)*0.07;
      // swells are longer and taller toward the horizon
      float far = 0.6 + smoothstep(8.0, 60.0, -z) * 0.9;
      // calm in the lee of the hull: tapers to 15% at the ship's side
      float sd = shipDist(w.xz);
      float lee = mix(0.15, 1.0, smoothstep(0.0, 3.5, sd));
      w.y += h * amp * far * lee;
      // inside the footprint: always below the floor / deck, hidden by them
      if (sd < 0.0) w.y = min(w.y, -0.15);
      vH = h * lee; vP = w.xz;
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uFlash, uLevel;
    varying float vH; varying vec3 vW; varying vec2 vP;
    ${NOISE}
    void main(){
      vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
      if (n.y < 0.0) n = -n;
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
      vec3 deep = vec3(0.010, 0.030, 0.040);
      vec3 sky = vec3(0.05, 0.075, 0.095) + uFlash * vec3(0.5, 0.55, 0.7);
      vec3 c = mix(deep, sky, fres * 0.8 + 0.06);
      c += vec3(0.02, 0.05, 0.05) * clamp(vH, 0.0, 1.0);
      // foam: crests broken up by noise, plus streaks
      float fo = vnoise(vP * 0.9 + vec2(uTime * 0.15, -uTime * 0.2));
      float crest = smoothstep(0.75 - uLevel * 0.15, 1.1, vH * 0.6 + fo * 0.7);
      c = mix(c, vec3(0.42, 0.47, 0.5) + uFlash, crest * 0.55);
      // distance haze toward the horizon colour
      float d = length(vW - cameraPosition);
      c = mix(c, vec3(0.06, 0.09, 0.11) + uFlash * 0.2, smoothstep(20.0, 70.0, d));
      gl_FragColor = vec4(c, 1.0);
    }`,
});

// ------------------------------------------------------------ rain

function rainMaterial(glass: boolean) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    blending: glass ? undefined : AdditiveBlending,
    uniforms: U,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFlash, uLevel;
      varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 uv = vUv * vec2(${glass ? "60.0, 8.0" : "120.0, 6.0"});
        float a = 0.0;
        ${
          glass
            ? `// beads that run down the glass in streaks
        for (int i = 0; i < 2; i++){
          vec2 g = uv * (1.0 + float(i) * 0.9);
          float col = floor(g.x);
          float sp = 0.25 + hash(vec2(col, 3.0 + float(i))) * 0.5;
          float y = g.y * 2.0 + uTime * sp + hash(vec2(col, 9.0)) * 40.0;
          float f = fract(y);
          float on = step(0.45, hash(vec2(col, floor(y) + float(i))));
          float x = abs(fract(g.x) - 0.5);
          float head = smoothstep(0.12, 0.02, x) * smoothstep(0.1, 0.0, f) * on;
          float tail = smoothstep(0.03, 0.0, x) * smoothstep(0.6, 0.0, f) * on * 0.5;
          a += head + tail;
        }
        // standing droplets
        float d = vnoise(vUv * vec2(160.0, 90.0));
        a += smoothstep(0.86, 0.92, d) * 0.35;
        a *= 0.14 + uLevel * 0.14;
        gl_FragColor = vec4(vec3(0.75, 0.85, 0.95) + uFlash, a * (0.7 + uFlash));`
            : `// slanted streaks falling through the air beyond the glass
        uv.x += uv.y * 0.18;
        float col = floor(uv.x);
        float y = uv.y + uTime * (5.0 + hash(vec2(col, 1.0)) * 3.0) + hash(vec2(col, 2.0)) * 20.0;
        float f = fract(y);
        float on = step(0.55 - uLevel * 0.25, hash(vec2(col, floor(y))));
        float x = abs(fract(uv.x) - 0.5);
        a = smoothstep(0.06, 0.0, x) * smoothstep(0.35, 0.0, f) * on * (0.10 + uLevel * 0.16);
        gl_FragColor = vec4(vec3(0.5, 0.6, 0.7) * (1.0 + uFlash * 3.0), a);`
        }
      }`,
  });
}
const glassRain = rainMaterial(true);
const airRain = rainMaterial(false);

// ------------------------------------------------------------ foredeck

const hullMat = new MeshStandardMaterial({ color: "#2b3236", roughness: 0.85, metalness: 0.3 });
const deckMat = new MeshStandardMaterial({ color: "#39413f", roughness: 0.9, metalness: 0.2 });
const railMat = new MeshStandardMaterial({ color: "#7c8683", roughness: 0.6, metalness: 0.6 });
const boxColors = ["#6e2f26", "#2d4b57", "#7a6a2b", "#3d5a3a", "#55575a"];
const boxMats = boxColors.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.3 }));
const navRed = new MeshBasicMaterial({ color: "#ff3a2a", toneMapped: false });
const navWhite = new MeshBasicMaterial({ color: "#fff4d8", toneMapped: false });

const DECK_Y = 0.55;
const DECK_Z0 = -4.3;
const LEN = 30;

function Foredeck() {
  const g = useRef<Group>(null);
  const geo = useMemo(() => {
    // plan view of the foredeck, tapering to the bow (x, -z)
    const s = new Shape();
    s.moveTo(-4.6, 0);
    s.lineTo(-4.6, 17);
    s.quadraticCurveTo(-4.2, 26, 0, LEN);
    s.quadraticCurveTo(4.2, 26, 4.6, 17);
    s.lineTo(4.6, 0);
    s.closePath();
    const sg = new ShapeGeometry(s, 10);
    sg.rotateX(-Math.PI / 2); // shape y -> world -z
    return sg;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  const boxes = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let k = 0;
    for (const z of [-8, -12.5, -17]) {
      for (const x of [-2.9, -0.5, 1.9]) {
        const jitter = ((k * 37) % 7) / 40;
        out.push({ p: [x + jitter, 0.62, z], s: [2.2, 1.3, 4.0], c: "#ffffff" });
        k++;
      }
    }
    return out;
  }, []);
  const ribs = useMemo<Item[]>(() => {
    const out: Item[] = [];
    // vertical stiffener ribs on each container's long side
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      for (let j = -3; j <= 3; j++) out.push({ p: [b.p[0] - 1.11, b.p[1], b.p[2] + j * 0.5], s: [0.03, 1.2, 0.08] });
    }
    return out;
  }, [boxes]);
  const posts = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (let z = -0.5; z > -17; z -= 2) for (const sx of [-1, 1]) out.push({ p: [sx * 4.5, 0.35, z], s: [0.05, 1.0, 0.05] });
    return out;
  }, []);

  useFrame(() => {
    if (g.current) {
      g.current.rotation.x = storm.pitch;
      g.current.rotation.z = storm.roll;
    }
  });
  return (
    <group ref={g} position={[0, DECK_Y, DECK_Z0]}>
      <mesh geometry={geo} material={deckMat} raycast={() => null} />
      {/* hull side below the rail, a dark skirt */}
      <mesh geometry={GEO.box} material={hullMat} position={[0, -1.2, -9]} scale={[9.4, 2.4, 18]} raycast={() => null} />
      {/* containers: one instanced draw per colour group would need more calls; one mesh,
          instance colours tint a white material */}
      <Instanced geo={GEO.box} mat={containerMat} items={boxes.map((b) => ({ ...b, p: [b.p[0], b.p[1] + 0.05, b.p[2] + 0.0], c: boxColors[Math.floor((b.p[0] + b.p[2] * 3.1 + 9) * 2.3) % boxColors.length] }))} position={[0, 0, 0]} />
      <Instanced geo={GEO.box} mat={railMat} items={ribs} />
      {/* rails */}
      <Instanced geo={GEO.box} mat={railMat} items={posts} />
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={GEO.box} material={railMat} position={[sx * 4.5, 0.85, -8.5]} scale={[0.04, 0.04, 16.5]} raycast={() => null} />
      ))}
      {/* foremast with nav light and a blinking truck light */}
      <mesh geometry={GEO.cyl12} material={railMat} position={[0, 4.0, -22]} scale={[0.12, 8.0, 0.12]} raycast={() => null} />
      <mesh geometry={GEO.box} material={railMat} position={[0, 6.2, -22]} scale={[2.2, 0.06, 0.06]} raycast={() => null} />
      <MastLights />
    </group>
  );
}

const containerMat = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.75, metalness: 0.3 });

function MastLights() {
  const top = useRef<Group>(null);
  useFrame(() => {
    if (top.current) top.current.visible = useStore.getState().reducedMotion || Math.sin(nowS() * 3.0) > -0.2;
  });
  return (
    <group position={[0, 0, -22]}>
      <mesh geometry={GEO.sphere} material={navWhite} position={[0, 8.05, 0]} scale={0.14} raycast={() => null} />
      <group ref={top}>
        <mesh geometry={GEO.sphere} material={navRed} position={[0, 6.3, 0.0]} scale={0.1} raycast={() => null} />
      </group>
      {/* port / starboard lights on the yard (shape differs from the truck light: boxes) */}
      <mesh geometry={GEO.box} material={navRed} position={[-1.1, 6.2, 0]} scale={0.18} raycast={() => null} />
      <mesh geometry={GEO.box} material={navWhite} position={[1.1, 6.2, 0]} scale={0.18} raycast={() => null} />
    </group>
  );
}

// ------------------------------------------------------------ driver + root

/** Advances the storm each frame: intensity, lightning, pitch/roll. */
export function StormDriver() {
  const nextBolt = useRef(4);
  const boltAt = useRef(-10);
  const lvl = useRef(0.4);
  useFrame((_, dt) => {
    const t = nowS();
    const reduced = useStore.getState().reducedMotion;
    lvl.current += (stormTarget() - lvl.current) * Math.min(1, dt * 0.5);
    storm.level = lvl.current;
    if (!reduced) {
      if (t > nextBolt.current) {
        boltAt.current = t;
        nextBolt.current = t + (14 - storm.level * 9) * (0.6 + Math.random() * 0.8);
      }
      const e = t - boltAt.current;
      // a sharp strike, a gap, then a softer re-strike
      storm.flash = e < 0.07 ? 1 : e > 0.16 && e < 0.26 ? 0.55 : e > 0.26 && e < 0.9 ? 0.18 * (1 - (e - 0.26) / 0.64) : 0;
      const k = 0.5 + storm.level;
      storm.pitch = (Math.sin(t * 0.43) * 0.014 + Math.sin(t * 0.91 + 1.3) * 0.006) * k;
      storm.roll = (Math.sin(t * 0.31) * 0.02 + Math.sin(t * 0.77) * 0.006) * k;
    } else {
      storm.flash = 0;
      storm.pitch = 0;
      storm.roll = 0;
    }
    U.uTime.value = reduced ? t * 0.3 : t;
    U.uFlash.value = storm.flash;
    U.uLevel.value = storm.level;
    grade.bloom = 1 + storm.flash * 0.6;
  });
  useEffect(
    () => () => {
      grade.bloom = 1;
    },
    [],
  );
  return null;
}

export function Exterior() {
  const sea = useMemo(() => new PlaneGeometry(170, 96, 120, 72).rotateX(-Math.PI / 2), []);
  useEffect(() => () => sea.dispose(), [sea]);
  return (
    <group>
      <StormDriver />
      <mesh material={skyMat} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[74, 32, 16]} />
      </mesh>
      <mesh geometry={sea} material={seaMat} position={[0, -0.3, -28]} raycast={() => null} frustumCulled={false} />
      <Foredeck />
      {/* rain: in the air beyond the glass, and on the glass itself */}
      <mesh geometry={GEO.plane} material={airRain} position={[0, 2, -9]} scale={[26, 9, 1]} raycast={() => null} />
      <mesh geometry={GEO.plane} material={glassRain} position={[0, 2.02, -4.02]} scale={[9.8, 1.5, 1]} raycast={() => null} />
    </group>
  );
}
