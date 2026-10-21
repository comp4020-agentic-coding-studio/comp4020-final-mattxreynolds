// Engine Room (Engineer). Vertical-slice version: shell + prologue lever.

import { useCallback } from "react";
import { send } from "../net.ts";
import { useStore } from "../store.ts";
import type { EngineerView } from "../../shared/protocol.ts";
import { box, type RoomLayout } from "./colliders.ts";
import { Interactable } from "./interact.tsx";
import { drawLabel, useCanvasTexture } from "./canvasTexture.ts";

export const ENGINE_LAYOUT: RoomLayout = {
  bounds: box(0, 0, 10, 8),
  solids: [],
  spawn: [0, 1.6, 2.5],
  spawnYaw: 0,
};

export function EngineRoom() {
  const view = useStore((s) => s.view) as EngineerView | null;
  const busOn = view?.prologue.busOn ?? false;
  const label = useCanvasTexture(512, 128, (ctx, w, h) => drawLabel(ctx, w, h, "EMERGENCY BUS", { border: "#d9a400" }), []);
  const pull = useCallback(() => void send({ t: "prologueBreaker" }), []);

  return (
    <group>
      <color attach="background" args={["#141a1d"]} />
      <hemisphereLight args={["#c9d6e0", "#2a2420", 0.7]} />
      <pointLight position={[0, 2.6, 0]} intensity={8} distance={14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#3a4144" />
      </mesh>
      <mesh position={[0, 1.5, -4]}>
        <boxGeometry args={[10, 3, 0.1]} />
        <meshStandardMaterial color="#56706a" />
      </mesh>
      <Interactable
        id="prologue-lever"
        prompt={busOn ? "Emergency bus — ON" : "Emergency bus — OFF · E to pull"}
        onUse={pull}
        position={[0, 1.2, -3.8]}
      >
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 0.8, 0.2]} />
          <meshStandardMaterial color="#2b2f31" />
        </mesh>
        <mesh position={[0, busOn ? -0.2 : 0.2, 0.2]} rotation={[busOn ? 0.6 : -0.6, 0, 0]}>
          <boxGeometry args={[0.08, 0.5, 0.08]} />
          <meshStandardMaterial color="#c0392b" emissive={busOn ? "#000" : "#5a0f08"} />
        </mesh>
      </Interactable>
      <mesh position={[0, 1.9, -3.94]}>
        <planeGeometry args={[1, 0.25]} />
        <meshBasicMaterial map={label} />
      </mesh>
    </group>
  );
}
