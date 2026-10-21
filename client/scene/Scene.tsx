// The 3D view for the local player's role. Each room owns its own lighting,
// background and fog, so the two room modules never share a file.

import { Canvas } from "@react-three/fiber";
import { useStore } from "../store.ts";
import { Bridge, BRIDGE_LAYOUT } from "./Bridge.tsx";
import { EngineRoom, ENGINE_LAYOUT } from "./EngineRoom.tsx";
import { Player } from "./Player.tsx";

export function Scene() {
  const role = useStore((s) => s.view?.you);
  if (!role) return null;
  const engineer = role === "ENGINEER";
  return (
    <Canvas
      id="scene"
      camera={{ fov: 70, near: 0.05, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      {engineer ? <EngineRoom /> : <Bridge />}
      <Player layout={engineer ? ENGINE_LAYOUT : BRIDGE_LAYOUT} />
    </Canvas>
  );
}
