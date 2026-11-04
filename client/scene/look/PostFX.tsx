// The shared camera "look" for both rooms (docs/VISUAL_DIRECTION.md):
//  - image-based lighting from a procedural RoomEnvironment (PMREM) so metals
//    and enamel have something to reflect, at low intensity so room lights
//    still own the mood;
//  - post: bloom on lamps, screens and sparks (UnrealBloom, half-res),
//    then a grade pass (vignette, film grain, a slight cold-shadow split,
//    an optional red "danger" pulse at the frame edge), then ACES output.
// On the "low" quality tier only the environment remains and the renderer
// draws straight to the screen. A sustained low frame rate steps down once.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, BoxGeometry, HalfFloatType, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useStore } from "../../store.ts";
import { setQuality } from "./quality.ts";

/** Live grade parameters; rooms write these in useFrame (no React state). */
export const grade = {
  /** 0..1 red pulse at the frame edge (danger / alarms) */
  alarm: 0,
  /** extra vignette darkness 0..1 (blackouts, LOST) */
  dark: 0,
  /** bloom strength multiplier */
  bloom: 1,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAlarm: { value: 0 },
    uDark: { value: 0 },
    uGrain: { value: 0.045 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAlarm, uDark, uGrain, uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      // vignette (stronger when dark)
      float vig = smoothstep(0.95, 0.25 - uDark * 0.2, r);
      c.rgb *= mix(0.55, 1.0, vig) * (1.0 - uDark * 0.35);
      // cold shadows, warm highlights (linear, pre-tonemap)
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb * vec3(0.92, 0.98, 1.06), c.rgb * vec3(1.04, 1.0, 0.94), smoothstep(0.05, 0.6, l));
      // danger: a red edge pulse
      c.rgb += vec3(0.5, 0.03, 0.02) * uAlarm * smoothstep(0.35, 0.9, r);
      // film grain
      float g = hash(vUv * 1024.0 + fract(uTime * 7.0)) - 0.5;
      c.rgb += g * uGrain * (0.4 + l);
      gl_FragColor = c;
    }
  `,
};

/** A dim steel compartment for reflections: dark walls, a warm fitting
 * strip overhead and a cool spill low on one side. (three's RoomEnvironment
 * is a bright white studio; its light boxes blew out wet decks and dial glass.) */
function compartmentEnv(): Scene {
  const s = new Scene();
  const box = new BoxGeometry(1, 1, 1);
  const room = new Mesh(box, new MeshBasicMaterial({ color: "#1b2224", side: BackSide }));
  room.scale.set(12, 4, 10);
  s.add(room);
  const strip = (color: string, p: [number, number, number], sc: [number, number, number]) => {
    const m = new Mesh(box, new MeshBasicMaterial({ color }));
    m.position.set(...p);
    m.scale.set(...sc);
    s.add(m);
  };
  strip("#9a8a6a", [0, 1.9, -1.5], [4, 0.05, 0.4]);
  strip("#9a8a6a", [0, 1.9, 2], [4, 0.05, 0.4]);
  strip("#3c5560", [-5.9, 0, 0], [0.05, 1.5, 6]);
  strip("#4a2a22", [5.9, -0.5, 0], [0.05, 1, 4]);
  return s;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(compartmentEnv(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 1;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Composer() {
  const { gl, scene, camera, size } = useThree();
  const t0 = useRef(performance.now());
  const slow = useRef(0);
  const { composer, bloom, gradePass } = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.renderTarget1.texture.type = HalfFloatType;
    composer.renderTarget2.texture.type = HalfFloatType;
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.4, 0.35, 1.1);
    composer.addPass(bloom);
    const gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
    return { composer, bloom, gradePass };
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    bloom.resolution.set(size.width / 2, size.height / 2);
    gradePass.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  }, [composer, bloom, gradePass, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);

  // priority 1: R3F stops its own render and lets this draw the frame
  useFrame((_, dt) => {
    const reduced = useStore.getState().reducedMotion;
    gradePass.uniforms.uTime.value = (performance.now() - t0.current) / 1000;
    gradePass.uniforms.uAlarm.value = reduced ? grade.alarm * 0.5 : grade.alarm;
    gradePass.uniforms.uDark.value = grade.dark;
    gradePass.uniforms.uGrain.value = reduced ? 0.02 : 0.045;
    bloom.strength = 0.4 * grade.bloom;
    composer.render(dt);
    // auto step-down: ~4 s of frames slower than 22 fps (ignoring hitches)
    if (dt > 1 / 22 && dt < 0.5) slow.current += dt;
    else slow.current = Math.max(0, slow.current - dt * 0.5);
    if (slow.current > 4) setQuality("low", false);
  }, 1);
  return null;
}

/** Mount once inside a room's <Canvas>. */
export function Look() {
  const quality = useStore((s) => s.quality);
  return (
    <>
      <Environment />
      {quality === "high" && <Composer />}
    </>
  );
}
