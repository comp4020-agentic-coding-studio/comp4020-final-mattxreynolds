// The 3D view for the local player's role. Each room owns its own lighting,
// background and fog, so the two room modules never share a file.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useRef } from "react";
import { useStore } from "../store.ts";
import { Bridge, BRIDGE_LAYOUT } from "./Bridge.tsx";
import { CinematicScene } from "./Cinematic.tsx";
import { EngineRoom, ENGINE_LAYOUT } from "./EngineRoom.tsx";
import { Player } from "./Player.tsx";
import { Look } from "./look/PostFX.tsx";
import { loadingOpen } from "./loading.ts";

/** Marks the scene ready once frames are flowing smoothly again after the
 * first-mount shader compile (which can stall the main thread for a second
 * or more on slow GPUs). Until then the briefing card says it's loading. */
function ReadyProbe() {
  const smooth = useRef(0);
  const done = useRef(false);
  const ready = () => {
    if (done.current) return;
    done.current = true;
    useStore.setState({ sceneReady: true });
  };
  useEffect(() => {
    // never strand a slow machine on the loading button
    const cap = setTimeout(ready, 20000);
    return () => {
      clearTimeout(cap);
      useStore.setState({ sceneReady: false });
    };
  }, []);
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    // dev/test probe: renderer cost (programs, draw calls); read-only
    (window as unknown as { __btwGl?: () => unknown }).__btwGl = () => ({ programs: gl.info.programs?.length, calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures });
  }, [gl]);
  useFrame((_, dt) => {
    if (done.current) return;
    // every staged part mounted and compiled (scene/loading.ts), then a
    // frame under 0.5 s means the last compile stall has passed
    // (a slow frame halves the streak rather than zeroing it: a CPU
    // rasteriser draws a full room in ~0.3-0.6 s and must still get there)
    if (loadingOpen() > 0) smooth.current = 0;
    else smooth.current = dt < 0.5 ? smooth.current + 1 : Math.floor(smooth.current / 2);
    if (smooth.current >= 4) ready();
  });
  return null;
}

/** three.js reads every program's info log after linking to report shader
 * errors. That read blocks until the driver finishes linking, defeating
 * KHR_parallel_shader_compile: profiling showed 7 s of a Bridge mount inside
 * getShaderInfoLog/getProgramInfoLog. Our shaders are fixed and tested, so
 * production skips the check; development keeps it for real error messages. */
function noShaderChecks({ gl }: { gl: { debug: { checkShaderErrors: boolean } } }): void {
  if (!import.meta.env.DEV) gl.debug.checkShaderErrors = false;
}

/** Memoised: the HUD around it re-renders on every server view (5×/s), and
 * the room components already subscribe to exactly the fields they draw. */
export const Scene = memo(function Scene() {
  const role = useStore((s) => s.view?.you);
  const cinematic = useStore((s) => s.cinematic);
  const quality = useStore((s) => s.quality);
  if (!role) return null;
  const engineer = role === "ENGINEER";
  if (cinematic) {
    // a separate light canvas: the room mounts (and compiles) after it
    return (
      <Canvas id="scene" camera={{ fov: 50, near: 0.1, far: 400 }} dpr={[1, 1.5]} gl={{ antialias: true }} onCreated={noShaderChecks}>
        <CinematicScene shot={cinematic.shot} start={cinematic.start} />
      </Canvas>
    );
  }
  return (
    <Canvas
      id="scene"
      camera={{ fov: 70, near: 0.05, far: 80 }}
      dpr={quality === "high" ? [1, 1.75] : [0.75, 1]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={noShaderChecks}
    >
      <Look />
      {engineer ? <EngineRoom /> : <Bridge />}
      <Player layout={engineer ? ENGINE_LAYOUT : BRIDGE_LAYOUT} />
      <ReadyProbe />
    </Canvas>
  );
});
