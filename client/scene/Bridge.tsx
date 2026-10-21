// Bridge (Radio Officer / Navigator). Vertical-slice version: shell + ack.

import { useCallback } from "react";
import { send } from "../net.ts";
import { useStore } from "../store.ts";
import type { NavigatorView } from "../../shared/protocol.ts";
import { box, type RoomLayout } from "./colliders.ts";
import { Interactable } from "./interact.tsx";

export const BRIDGE_LAYOUT: RoomLayout = {
  bounds: box(0, 0, 10, 8),
  solids: [],
  spawn: [0, 1.6, 2.5],
  spawnYaw: 0,
};

export function Bridge() {
  const view = useStore((s) => s.view) as NavigatorView | null;
  const busOn = view?.prologue.busOn ?? false;
  const acked = view?.prologue.acknowledged ?? false;
  const ack = useCallback(() => void send({ t: "prologueAck" }), []);

  return (
    <group>
      <color attach="background" args={["#0e1a24"]} />
      <hemisphereLight args={["#c9d6e0", "#2a2420", 0.7]} />
      <pointLight position={[0, 2.6, 0]} intensity={8} distance={14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#4a3f35" />
      </mesh>
      <mesh position={[0, 0.5, -3]}>
        <boxGeometry args={[3, 1, 0.8]} />
        <meshStandardMaterial color="#2f3a40" emissive={busOn ? "#103040" : "#000"} />
      </mesh>
      <Interactable
        id="prologue-ack"
        prompt={!busOn ? "Alarm acknowledge — NO POWER" : acked ? "Alarm — ACKNOWLEDGED" : "Alarm acknowledge · E to press"}
        onUse={ack}
        position={[0, 1.05, -2.8]}
      >
        <mesh>
          <cylinderGeometry args={[0.12, 0.12, 0.08, 24]} />
          <meshStandardMaterial color={busOn ? "#e74c3c" : "#3a1a17"} emissive={busOn && !acked ? "#7a1a10" : "#000"} />
        </mesh>
      </Interactable>
    </group>
  );
}
