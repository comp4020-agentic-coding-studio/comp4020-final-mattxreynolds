// Per-act atmosphere, usable by both rooms: drifting dust / mist motes and
// the grade pass inputs (grade.alarm red edge pulse, grade.dark blackout).
// Act I is dim and uncertain (slow, sparse); Act V urgent (fast alarm pulse).
// Derived from the view: phase/act, danger, ship.gridDown, ship.circuits.LIGHTS.
// Mount: <Atmosphere w={10} d={8} h={3} />  (cx/cz centre it).

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { ACT_OF } from "../../../shared/protocol.ts";
import { useStore } from "../../store.ts";
import { grade } from "../look/PostFX.tsx";
import { Pool } from "./pool.ts";

const N = 60;

export function Atmosphere({ w = 10, d = 8, h = 3, cx = 0, cz = 0 }: { w?: number; d?: number; h?: number; cx?: number; cz?: number }) {
  const pool = useMemo(() => {
    const p = new Pool(N);
    for (let i = 0; i < N; i++) {
      const q = p.spawn();
      q.life = 1e9;
      q.t = 1;
      q.x = cx + (Math.random() - 0.5) * w;
      q.y = Math.random() * h;
      q.z = cz + (Math.random() - 0.5) * d;
      q.s = 0.006 + Math.random() * 0.012;
      q.r = 0.7; q.g = 0.75; q.b = 0.78;
    }
    return p;
  }, [w, d, h, cx, cz]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useStore.getState();
    const v = st.view;
    const t = performance.now() / 1000;
    const phase = v?.phase ?? "LOBBY";
    const act = ACT_OF[phase] || 0;
    const danger = (v?.danger ?? 0) / 100;
    const rm = st.reducedMotion;
    const lost = phase === "LOST";
    const gridDown = !!v?.ship?.gridDown;
    const lightsOut = v?.ship ? !v.ship.circuits.LIGHTS && act >= 2 : false;

    // alarm pulse: faster in later acts; steady (no pulse) when reduced motion
    const rate = 1.2 + act * 0.6;
    const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(t * rate * Math.PI);
    const alarm = lost || !v ? 0 : Math.max(0, danger - 0.5) * 1.1 + (gridDown ? 0.2 : 0) + (act === 5 ? 0.1 : 0);
    grade.alarm = Math.min(1, alarm) * (0.35 + 0.65 * pulse);
    const dark = lost ? 0.85 : gridDown ? 0.35 : lightsOut ? 0.25 : act === 1 ? 0.12 : 0;
    grade.dark += (dark - grade.dark) * Math.min(1, dt * 2);

    const k = (rm ? 0.25 : 1) * (0.5 + act * 0.25);
    const q = st.quality === "low" ? 0.5 : 1;
    const a = (act === 1 ? 0.14 : 0.08 + danger * 0.1) * q;
    const parts = pool.parts;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      if (i >= N * q) {
        p.a = 0;
        continue;
      }
      p.a = a;
      p.x += (Math.sin(t * 0.2 + i) * 0.05 + 0.02 * (i % 3)) * dt * k;
      p.y += Math.sin(t * 0.3 + i * 1.3) * 0.04 * dt * k;
      p.z += Math.cos(t * 0.17 + i * 0.7) * 0.05 * dt * k;
      if (p.x > cx + w / 2) p.x -= w;
      if (p.x < cx - w / 2) p.x += w;
      if (p.y > h) p.y = 0.2;
      if (p.y < 0.1) p.y = h - 0.2;
    }
    pool.update(0);
  });

  return <primitive object={pool.mesh} />;
}
