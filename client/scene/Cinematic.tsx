// Cinematic bookends, procedural and cheap: an exterior night sea with the
// ship. Three shots share one small scene.
//   intro    — the ship steams through the storm, a collision, power fails,
//              then a cut into the player's own room (~22 s, skippable)
//   survived — lifeboat pulling clear while the ship lists and settles
//   lost     — lights die and the hull goes under
// No character animation; motion is the camera, the hull and the lights.

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type PointLight,
  ShaderMaterial,
  SphereGeometry,
  BackSide,
} from "three";

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

const sea = new ShaderMaterial({
  uniforms: { t: { value: 0 }, flash: { value: 0 } },
  vertexShader: /* glsl */ `
    uniform float t;
    varying float vH;
    varying vec2 vXZ;
    void main() {
      vec3 p = position;
      float h = sin(p.x * 0.18 + t * 0.9) * 0.6 + sin(p.y * 0.23 - t * 0.7) * 0.5 + sin((p.x + p.y) * 0.5 + t * 1.7) * 0.18;
      p.z += h;
      vH = h;
      vXZ = p.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float flash;
    varying float vH;
    varying vec2 vXZ;
    void main() {
      vec3 deep = vec3(0.02, 0.05, 0.07);
      vec3 crest = vec3(0.12, 0.2, 0.24);
      vec3 c = mix(deep, crest, smoothstep(-0.4, 1.0, vH));
      float fade = smoothstep(140.0, 30.0, length(vXZ));
      c = mix(vec3(0.03, 0.05, 0.07), c, fade) + flash * 0.25;
      gl_FragColor = vec4(c, 1.0);
    }`,
});

const sky = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  uniforms: { flash: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float flash;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, -0.1, 1.0);
      vec3 c = mix(vec3(0.05, 0.07, 0.09), vec3(0.01, 0.015, 0.025), smoothstep(0.0, 0.6, h));
      gl_FragColor = vec4(c + flash * vec3(0.5, 0.55, 0.6) * (0.4 + h), 1.0);
    }`,
});

const hullMat = new MeshStandardMaterial({ color: "#20262b", roughness: 0.8, metalness: 0.2 });
const deckMat = new MeshStandardMaterial({ color: "#3a3f40", roughness: 0.9 });
const houseMat = new MeshStandardMaterial({ color: "#c9c3b4", roughness: 0.7 });
const redMat = new MeshStandardMaterial({ color: "#6e1d16", roughness: 0.8 });
const portMat = new MeshBasicMaterial({ color: new Color("#ffcf7a") });
const boatMat = new MeshStandardMaterial({ color: "#e0662c", roughness: 0.6, emissive: new Color("#401200") });
const iceMat = new MeshStandardMaterial({ color: "#2d3438", roughness: 1 });
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 12);

/** Smooth 0→1 between a and b. */
const ramp = (t: number, a: number, b: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function Ship({ portsOn }: { portsOn: (t: number) => number }) {
  const ports = useMemo(() => Array.from({ length: 9 }, (_, i) => -8 + i * 2), []);
  const portRefs = useRef<Mesh[]>([]);
  useFrame(() => {
    const k = portsOn(performance.now() / 1000);
    portMat.color.setRGB(1 * k, 0.81 * k, 0.48 * k);
    for (const m of portRefs.current) if (m) m.visible = k > 0.02;
  });
  return (
    <group>
      {/* hull: long box with a tapered bow block */}
      <mesh geometry={box} material={hullMat} position={[0, 0.2, 0]} scale={[22, 3.2, 4.4]} />
      <mesh geometry={box} material={redMat} position={[0, -1.2, 0]} scale={[22.05, 0.6, 4.45]} />
      <mesh geometry={box} material={hullMat} position={[12, 0.6, 0]} scale={[3, 2.4, 3]} rotation={[0, Math.PI / 4, 0]} />
      <mesh geometry={box} material={deckMat} position={[0, 1.85, 0]} scale={[22, 0.1, 4.3]} />
      {/* deckhouse aft, funnel, mast */}
      <mesh geometry={box} material={houseMat} position={[-7, 3.3, 0]} scale={[4.2, 2.8, 3.8]} />
      <mesh geometry={box} material={houseMat} position={[-7.3, 5.2, 0]} scale={[3.2, 1.2, 3.4]} />
      <mesh geometry={cyl} material={redMat} position={[-9, 5.6, 0]} scale={[0.8, 3, 0.8]} />
      <mesh geometry={cyl} material={hullMat} position={[6, 4.5, 0]} scale={[0.12, 5.5, 0.12]} />
      {/* cargo hatches */}
      {[-2, 2, 6].map((x) => (
        <mesh key={x} geometry={box} material={deckMat} position={[x, 2.2, 0]} scale={[2.6, 0.6, 3.2]} />
      ))}
      {/* lit portholes along the deckhouse and hull */}
      {ports.map((x, i) => (
        <mesh key={x} ref={(m) => void (portRefs.current[i] = m!)} geometry={box} material={portMat} position={[x, 0.9, 2.22]} scale={[0.35, 0.3, 0.02]} />
      ))}
      <mesh geometry={box} material={portMat} position={[-7.3, 5.2, 1.72]} scale={[2.6, 0.4, 0.02]} />
    </group>
  );
}

/** The procedural exterior. `start` is performance.now()/1000 when the shot began. */
export function CinematicScene({ shot, start }: { shot: Shot; start: number }) {
  const { camera } = useThree();
  const ship = useRef<Group>(null);
  const boat = useRef<Group>(null);
  const berg = useRef<Group>(null);
  const flash = useRef<PointLight>(null);
  const emergency = useRef<PointLight>(null);
  const seaGeo = useMemo(() => new PlaneGeometry(300, 300, 90, 90), []);
  const skyGeo = useMemo(() => new SphereGeometry(200, 24, 12), []);

  // ports: lit, then they die after the collision (intro) or go dark (lost)
  const portsOn = (now: number): number => {
    const t = now - start;
    if (shot === "intro") return t < 9 ? 1 : t < 13 ? (Math.sin(t * 40) > 0 ? 0.8 : 0.1) * (1 - ramp(t, 9, 13)) : 0;
    if (shot === "lost") return 1 - ramp(t, 0.5, 4);
    return 0.3;
  };

  useFrame((_, dt) => {
    const now = performance.now() / 1000;
    const t = now - start;
    sea.uniforms.t.value += dt;
    let lightning = Math.max(0, Math.sin(now * 0.7) * Math.sin(now * 3.1) - 0.97) * 30;
    const s = ship.current!;
    if (shot === "intro") {
      // steaming ahead, the impact at 8.4 s jolts the hull, then a slow list
      const hit = t > 8.4 ? Math.exp(-(t - 8.4) * 3) : 0;
      s.position.set(-8 + t * 0.6, -0.2 + Math.sin(now * 0.8) * 0.25 - ramp(t, 9, 22) * 0.8, 0);
      s.rotation.set(Math.sin(now * 0.6) * 0.04 + ramp(t, 9, 22) * 0.08 + hit * 0.12, 0, Math.sin(now * 0.45) * 0.02 + ramp(t, 9, 22) * 0.04);
      if (t > 8.4 && t < 8.7) lightning = 1.5;
      berg.current!.visible = true;
      berg.current!.position.set(8 + 0.6 * 8.4 + 4, -1, 3.5);
      // camera: wide, then push in past the bow, then down to the waterline
      const k1 = ramp(t, 0, 8);
      const k2 = ramp(t, 13, 21);
      // wide establishing → three-quarter on the bow for the impact → low
      // and back along the listing hull as the power dies
      camera.position.set(-30 + k1 * 26 - k2 * 14, 9 - k1 * 4 - k2 * 3, 26 - k1 * 6 + k2 * 2);
      camera.lookAt(s.position.x + 4 - k2 * 6, s.position.y + 1 - k2 * 0.5, 0);
    } else if (shot === "survived") {
      // the ship settles by the head; the lifeboat pulls away
      s.position.set(0, -0.6 - ramp(t, 0, 14) * 3, 0);
      s.rotation.set(ramp(t, 0, 14) * 0.18, 0, -ramp(t, 0, 14) * 0.16);
      berg.current!.visible = false;
      boat.current!.visible = true;
      boat.current!.position.set(-2 + t * 0.9, -0.35 + Math.sin(now * 1.3) * 0.15, 8 + t * 1.2);
      boat.current!.rotation.set(Math.sin(now * 1.1) * 0.08, 0.5, Math.sin(now * 0.9) * 0.06);
      camera.position.set(-14 + t * 0.6, 4 + t * 0.15, 30 - t * 0.4);
      camera.lookAt(boat.current!.position.x - 4, 0, 4);
    } else {
      // lost: lights die, the hull rolls and goes under
      s.position.set(0, -0.6 - ramp(t, 1, 9) * 7, 0);
      s.rotation.set(ramp(t, 1, 9) * 0.5, 0, ramp(t, 2, 9) * 0.25);
      berg.current!.visible = false;
      camera.position.set(-20, 4 - ramp(t, 2, 9) * 2, 22);
      camera.lookAt(0, -1 - ramp(t, 2, 9) * 2, 0);
    }
    sky.uniforms.flash.value = Math.min(1, lightning);
    sea.uniforms.flash.value = Math.min(1, lightning) * 0.5;
    if (flash.current) flash.current.intensity = lightning * 400;
    // the red emergency beacon turns once main power is gone
    if (emergency.current) {
      const on = (shot === "intro" && t > 12) || shot === "lost";
      emergency.current.intensity = on ? (Math.sin(now * 6) > 0 ? 30 : 4) : 0;
    }
  });

  return (
    <>
      <color attach="background" args={["#05080b"]} />
      <fog attach="fog" args={["#05080b", 30, 140]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[-20, 30, 10]} intensity={0.5} color="#8aa0b0" />
      <directionalLight position={[30, 6, -20]} intensity={0.35} color="#d08a5a" />
      <pointLight ref={flash} position={[-30, 60, -40]} intensity={0} distance={300} decay={1} color="#cfe0ff" />
      <mesh geometry={skyGeo} material={sky} />
      <mesh geometry={seaGeo} material={sea} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]} />
      <group ref={ship}>
        <Ship portsOn={portsOn} />
        <pointLight ref={emergency} position={[-7, 6.4, 0]} intensity={0} distance={18} color="#ff3020" />
      </group>
      {/* what the ship hit: a dark, half-submerged shape off the bow */}
      <group ref={berg} visible={false}>
        <mesh geometry={box} material={iceMat} scale={[6, 3, 5]} rotation={[0.2, 0.6, 0.1]} />
      </group>
      <group ref={boat} visible={false}>
        <mesh geometry={box} material={boatMat} scale={[3, 0.8, 1.2]} />
        <mesh geometry={box} material={boatMat} position={[0, 0.6, 0]} scale={[2.4, 0.5, 1]} />
        <pointLight position={[0, 1.4, 0]} intensity={8} distance={8} color="#ffd9a0" />
      </group>
    </>
  );
}
