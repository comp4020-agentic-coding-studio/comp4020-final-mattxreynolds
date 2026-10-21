// The 3D view for the local player's role. Each room owns its own lighting,
// background and fog, so the two room modules never share a file.

import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useRef } from "react";
import { useStore } from "../store.ts";
import { Bridge, BRIDGE_LAYOUT } from "./Bridge.tsx";
import { CinematicScene } from "./Cinematic.tsx";
import { EngineRoom, ENGINE_LAYOUT } from "./EngineRoom.tsx";
import { Player } from "./Player.tsx";

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
    const cap = setTimeout(ready, 6000);
    return () => {
      clearTimeout(cap);
      useStore.setState({ sceneReady: false });
    };
  }, []);
  useFrame((_, dt) => {
    if (done.current) return;
    // a frame under 0.5 s means the compile stall has passed
    smooth.current = dt < 0.5 ? smooth.current + 1 : 0;
    if (smooth.current >= 8) ready();
  });
  return null;
}

/** Memoised: the HUD around it re-renders on every server view (5×/s), and
 * the room components already subscribe to exactly the fields they draw. */
export const Scene = memo(function Scene() {
  const role = useStore((s) => s.view?.you);
  const cinematic = useStore((s) => s.cinematic);
  if (!role) return null;
  const engineer = role === "ENGINEER";
  if (cinematic) {
    // a separate light canvas: the room mounts (and compiles) after it
    return (
      <Canvas id="scene" camera={{ fov: 50, near: 0.1, far: 400 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <CinematicScene shot={cinematic.shot} start={cinematic.start} />
      </Canvas>
    );
  }
  return (
    <Canvas
      id="scene"
      camera={{ fov: 70, near: 0.05, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      {engineer ? <EngineRoom /> : <Bridge />}
      <Player layout={engineer ? ENGINE_LAYOUT : BRIDGE_LAYOUT} />
      <ReadyProbe />
    </Canvas>
  );
});
