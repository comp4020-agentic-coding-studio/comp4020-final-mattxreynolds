// The Navigator feels the disaster too: breach / compartment-loss fx raise
// motion.jolt (Player applies the camera jolt, and a small shake offset) and
// condensation drips and haze form under the deckhead as danger rises.
// Driven by view.danger, hull.breached (more drips) and breach/burst/
// compartmentLost fx. Mount in Bridge.tsx: <BridgeDistress />  (props w, d, h).

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { onFx, useStore } from "../../store.ts";
import { motion, Pool } from "./pool.ts";

export function BridgeDistress({ w = 10, d = 8, h = 3.2 }: { w?: number; d?: number; h?: number }) {
  const drips = useMemo(() => new Pool(40), []);
  const mist = useMemo(() => new Pool(30), []);
  const acc = useMemo(() => ({ drip: 0, mist: 0 }), []);

  useEffect(
    () =>
      onFx((fx) => {
        if (fx.k === "breach" || fx.k === "compartmentLost" || fx.k === "burst") {
          const j = fx.k === "compartmentLost" ? 1 : 0.7;
          motion.jolt = Math.max(motion.jolt, j);
        }
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useStore.getState();
    const v = st.view;
    const rm = st.reducedMotion;
    const q = (st.quality === "low" ? 0.5 : 1) * (rm ? 0.5 : 1);
    const danger = (v?.danger ?? 0) / 100;
    const breached = v && v.you === "NAVIGATOR" ? Object.values(v.hull.breached).filter(Boolean).length : 0;
    acc.drip += (danger > 0.35 ? (danger - 0.3) * 8 + breached * 1.5 : 0) * q * dt;
    while (acc.drip >= 1) {
      acc.drip -= 1;
      const p = drips.spawn();
      p.life = 1.2;
      p.s = 0.012;
      p.x = (Math.random() - 0.5) * (w - 1); p.y = h - 0.05; p.z = (Math.random() - 0.5) * (d - 1);
      p.vx = p.vy = p.vz = 0;
      p.grav = 9;
      p.floor = 0.02;
      p.r = 0.7; p.g = 0.85; p.b = 0.92;
      p.a = 0.9;
    }
    acc.mist += (danger > 0.5 ? (danger - 0.45) * 4 : 0) * q * dt;
    while (acc.mist >= 1) {
      acc.mist -= 1;
      const p = mist.spawn();
      p.life = 4;
      p.s = 0.3;
      p.grow = 2.5;
      p.x = (Math.random() - 0.5) * w; p.y = h - 0.3; p.z = (Math.random() - 0.5) * d;
      p.vx = (Math.random() - 0.5) * 0.1; p.vy = -0.02; p.vz = (Math.random() - 0.5) * 0.1;
      p.r = 0.6; p.g = 0.68; p.b = 0.72;
      p.a = 0.07;
    }
    drips.update(dt);
    mist.update(dt);
  });

  return (
    <>
      <primitive object={drips.mesh} />
      <primitive object={mist.mesh} />
    </>
  );
}
