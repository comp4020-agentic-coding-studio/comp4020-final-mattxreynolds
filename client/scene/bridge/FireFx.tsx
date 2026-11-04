// The compartment fire felt in the Comms Room (Bridge). Driven only by the
// Navigator's view (fire.state, fire.intensity) and the shared Fx
// {k:"fire"} events, so it shows nothing the fire card does not (never the
// class mark).
//   FIRE ALARM lamp over the fire card, with a warning-triangle plate whose
//   word carries the state (FIRE / FIRE OUT / FLASHOVER / NO FIRE), and a
//   light pattern that is not colour alone:
//     burning       -> double flash, faster above 75 % intensity
//     burnt         -> slow single pulse
//     out / idle    -> dark
//     reduced motion: steady on while burning
//   cabinet edge    -> an orange flicker round the fire card's cabinet,
//                      brighter with intensity; a bright flash on "flare" /
//                      "burnout"
//   smoke haze      -> faint smoke seeping in through the door and banking
//                      under the deckhead while intensity > 50
// Quality "low" halves the haze; reduced motion thins and slows it.
// Mount in Bridge.tsx: <FireFx position={...} rotationY={...} /> with the
// same placement as the IncidentPanel.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MeshBasicMaterial, MeshStandardMaterial } from "three";
import { onFx, useStore } from "../../store.ts";
import { Pool } from "../fx/pool.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { COMMS } from "./Comms.tsx";
import { GEO, MAT } from "./kit.tsx";
import { ROOM } from "./Room.tsx";
import { navView, nowS, useNav } from "./state.ts";

/** IncidentPanel cabinet (local): centre y, width, height */
const CAB = { y: 0.06, w: 1.7, h: 1.36 } as const;
const EDGE = 0.035;
const MONO = `"DejaVu Sans Mono", "Courier New", monospace`;

/** The double-flash alarm pattern (0..1), period 1.2 s (0.8 s when `fast`). */
function alarmPattern(t: number, fast: boolean): number {
  const T = fast ? 0.8 : 1.2;
  const ph = (t % T) / T;
  return ph < 0.12 || (ph > 0.24 && ph < 0.36) ? 1 : 0;
}

function AlarmPlate({ word, lit }: { word: string; lit: boolean }) {
  const map = useCanvasTexture(
    512,
    128,
    (ctx, W, H) => {
      ctx.fillStyle = lit ? "#6a1810" : PALETTE.plateBg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = PALETTE.hazardYellow;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, W - 8, H - 8);
      // the shape: a warning triangle with an exclamation bar
      ctx.fillStyle = PALETTE.hazardYellow;
      ctx.beginPath();
      ctx.moveTo(H * 0.62, H * 0.14);
      ctx.lineTo(H * 1.08, H * 0.86);
      ctx.lineTo(H * 0.16, H * 0.86);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(H * 0.57, H * 0.38, H * 0.1, H * 0.28);
      ctx.fillRect(H * 0.57, H * 0.71, H * 0.1, H * 0.08);
      ctx.fillStyle = PALETTE.plateText;
      ctx.font = `bold ${Math.round(H * 0.46)}px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(word, H * 1.3, H * 0.54);
    },
    [word, lit],
  );
  return (
    <mesh geometry={GEO.plane} position={[0.34, 0, 0.012]} scale={[0.52, 0.13, 1]}>
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}

const haze = new Pool(36);

export function FireFx({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const state = useNav((v) => v.fire.state, "idle");
  const word = state === "burning" ? "FIRE" : state === "out" ? "FIRE OUT" : state === "burnt" ? "FLASHOVER" : "NO FIRE";
  const mats = useMemo(
    () => ({
      lamp: new MeshStandardMaterial({ color: "#4a1410", emissive: PALETTE.lampRed, emissiveIntensity: 0, roughness: 0.3 }),
      edge: new MeshBasicMaterial({ color: "#ff7a26", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const live = useMemo(() => ({ kick: 0, acc: 0 }), []);

  useEffect(
    () =>
      onFx((fx) => {
        if (fx.k !== "fire") return;
        if (fx.ev === "flare") live.kick = Math.max(live.kick, 0.8);
        if (fx.ev === "burnout") live.kick = Math.max(live.kick, 1.2);
      }),
    [live],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const v = navView();
    const st = useStore.getState();
    const rm = st.reducedMotion;
    const q = st.quality === "low" ? 0.5 : 1;
    const t = nowS();
    const f = v?.fire;
    const burning = f?.state === "burning";
    const k = burning ? (f?.intensity ?? 0) / 100 : 0;

    // the lamp: the pattern carries the state, colour is a second cue
    let lamp = 0;
    if (burning) lamp = rm ? 1 : alarmPattern(t, k > 0.75);
    else if (f?.state === "burnt") lamp = rm ? 0.5 : 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.6));
    mats.lamp.emissiveIntensity = 0.05 + lamp * 3;

    // the cabinet edge glows orange, flickering like firelight
    live.kick = Math.max(0, live.kick - dt * (rm ? 0.8 : 1.6));
    const flick = rm ? 0.8 : 0.6 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.3) + 0.15 * Math.sin(t * 41);
    mats.edge.opacity = Math.min(1, (burning ? 0.12 + k * 0.5 : 0) * flick + live.kick * 0.7);

    // haze: faint smoke seeping through the door and banking under the deckhead
    if (burning && (f?.intensity ?? 0) > 50) {
      live.acc += (1 + (k - 0.5) * 6) * q * (rm ? 0.5 : 1) * dt;
      while (live.acc >= 1) {
        live.acc -= 1;
        const p = haze.spawn();
        p.x = COMMS.x0 + 0.3 + Math.random() * 0.5;
        p.y = 1.6 + Math.random() * 0.8;
        p.z = Math.random() * 1.2;
        p.vx = 0.15 + Math.random() * 0.2;
        p.vy = 0.1 + Math.random() * 0.08;
        p.vz = (Math.random() - 0.5) * 0.3;
        p.drag = 0.15;
        p.ceil = ROOM.h - 0.3 + (Math.random() - 0.5) * 0.15;
        p.life = 9 + Math.random() * 4;
        p.s = 0.35 + Math.random() * 0.25;
        p.grow = 4.5;
        p.r = 0.45; p.g = 0.43; p.b = 0.41;
        p.a = 0.1 + (k - 0.5) * 0.25;
      }
    } else {
      live.acc = 0;
      if (f?.state !== "burning") haze.fade(Math.exp(-dt * 0.6));
    }
    for (const p of haze.parts) if (p.alive && p.x > COMMS.x1 - 0.5) p.vx = -Math.abs(p.vx) * 0.3;
    haze.update(dt);
  });

  const hw = CAB.w / 2 + EDGE / 2;
  const hh = CAB.h / 2 + EDGE / 2;
  return (
    <>
      <primitive object={haze.mesh} />
      <group position={position} rotation={[0, rotationY, 0]}>
        {/* the orange flicker round the cabinet edge */}
        {(
          [
            [0, CAB.y + hh, CAB.w + EDGE * 2, EDGE],
            [0, CAB.y - hh, CAB.w + EDGE * 2, EDGE],
            [-hw, CAB.y, EDGE, CAB.h],
            [hw, CAB.y, EDGE, CAB.h],
          ] as const
        ).map(([x, y, w, h], i) => (
          <mesh key={i} geometry={GEO.box} material={mats.edge} position={[x, y, -0.05]} scale={[w, h, 0.09]} />
        ))}
        {/* FIRE ALARM lamp over the card, with its triangle plate */}
        <group position={[-0.3, CAB.y + CAB.h / 2 + 0.2, -0.06]}>
          <mesh geometry={GEO.box} material={MAT.consoleDark} position={[0.18, 0, -0.01]} scale={[0.9, 0.2, 0.04]} />
          <mesh geometry={GEO.cyl} material={MAT.brass} rotation={[Math.PI / 2, 0, 0]} position={[-0.19, 0, 0.01]} scale={[0.075, 0.03, 0.075]} />
          <mesh geometry={GEO.sphere} material={mats.lamp} position={[-0.19, 0, 0.03]} scale={[0.06, 0.06, 0.05]} />
          <AlarmPlate word={word} lit={state === "burning"} />
        </group>
      </group>
    </>
  );
}
