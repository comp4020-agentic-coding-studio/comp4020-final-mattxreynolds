// The diesel generator block along the west wall. Idle and still until the
// generator is online, then the flywheel spins up and the rumble lamps glow;
// it spins down whenever the grid trips (the plant is reset in the Aux
// Machinery Room). Purely an indicator: not interactable.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, MeshStandardMaterial } from "three";
import { At, B, C, ev, G, M, Pipe, Plate, stageOf, STAGE, useEV, useEVs } from "./kit.tsx";
import { GeneratorDetail } from "./Dressing.tsx";
import { AT } from "./layout.ts";

export function Generator() {
  const m = M();
  const running = useEVs((v) => [((v?.power.online ?? false) || stageOf(v) > STAGE.POWER) && !(v?.ship.gridDown ?? false)] as [boolean])[0];
  const tripped = useEV((v) => v.ship.gridDown, false);
  const fly = useRef<Group>(null);
  const speed = useRef(0);
  const glow = useMemo(() => new MeshStandardMaterial({ color: "#3a2a18", emissive: "#ff9a3a", emissiveIntensity: 0, roughness: 0.4 }), []);
  useFrame((_, dt) => {
    const v = ev();
    const online = (v?.power.online ?? false) || stageOf(v) > STAGE.POWER;
    const lost = v?.phase === "LOST";
    const want = online && !lost && !v?.ship.gridDown ? 9 : 0;
    speed.current += (want - speed.current) * Math.min(1, dt * (want > speed.current ? 0.5 : 0.8));
    if (fly.current) fly.current.rotation.x += speed.current * dt;
    const t = performance.now() / 1000;
    glow.emissiveIntensity = (speed.current / 9) * (1.6 + Math.sin(t * 23) * 0.25);
  });

  return (
    // authored along +x, facing +z; turned so it lies along the west wall facing into the room
    <At p={AT.generator} r={[0, Math.PI / 2, 0]}>
      <GeneratorDetail />
      {/* plinth */}
      <B p={[0, 0.1, 0]} s={[2.6, 0.2, 1.0]} m={m.pipeDark} />
      {/* engine block */}
      <B p={[-0.3, 0.7, 0]} s={[1.6, 1.0, 0.8]} m={m.green} />
      <B p={[-0.3, 1.28, 0]} s={[1.4, 0.16, 0.6]} m={m.steel} />
      {/* cylinder heads */}
      {[-0.85, -0.45, -0.05, 0.35].map((x) => (
        <group key={x}>
          <B p={[x, 1.45, 0]} s={[0.28, 0.18, 0.42]} m={m.pipe} />
          <C p={[x, 1.6, 0.1]} d={0.06} l={0.12} m={m.brass} />
        </group>
      ))}
      {/* exhaust manifold up to the ceiling */}
      <Pipe a={[-0.3, 1.35, -0.35]} b={[-0.3, 3, -0.35]} d={0.16} m={m.pipeDark} />
      {/* alternator drum */}
      <C p={[0.85, 0.72, 0]} d={0.75} l={0.6} m={m.steel} r={[0, 0, Math.PI / 2]} />
      {/* flywheel with spokes, so rotation is visible */}
      <group ref={fly} position={[1.24, 0.72, 0]}>
        <mesh geometry={G().torus} material={m.brassDark} rotation={[0, Math.PI / 2, 0]} scale={[0.8, 0.8, 1.2]} />
        {[0, 1, 2].map((k) => (
          <B key={k} p={[0, 0, 0]} s={[0.05, 0.78, 0.06]} m={m.brass} r={[(k * Math.PI) / 3, 0, 0]} />
        ))}
        <C p={[0, 0, 0]} d={0.14} l={0.1} m={m.brass} r={[0, 0, Math.PI / 2]} />
      </group>
      <B p={[-1.25, 0.72, 0]} s={[0.08, 0.95, 0.95]} m={m.hazard} />
      {/* rumble lamps on the block */}
      {[-0.7, -0.3, 0.1].map((x) => (
        <mesh key={x} geometry={G().sphere} material={glow} position={[x, 0.95, 0.41]} scale={[0.07, 0.07, 0.04]} />
      ))}
      <Plate text="GENERATOR No.1" w={0.9} h={0.15} position={[-0.3, 0.55, 0.405]} glow={0.6} />
      <Plate text={running ? "RUNNING" : tripped ? "GRID TRIPPED" : "STOPPED"} w={0.5} h={0.12} position={[0.85, 0.3, 0.505]} bg={running ? "#1d5a33" : "#4a1712"} glow={0.7} />
    </At>
  );
}
