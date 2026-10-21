// The 3D view for the local player's role.

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
      <color attach="background" args={[engineer ? "#141a1d" : "#0e1a24"]} />
      <fog attach="fog" args={[engineer ? "#141a1d" : "#0e1a24", 6, 22]} />
      <hemisphereLight args={["#c9d6e0", "#2a2420", 0.7]} />
      <pointLight position={[0, 2.6, 0]} intensity={8} distance={14} />
      {engineer ? <EngineRoom /> : <Bridge />}
      <Player layout={engineer ? ENGINE_LAYOUT : BRIDGE_LAYOUT} />
    </Canvas>
  );
}
