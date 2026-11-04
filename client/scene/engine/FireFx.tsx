// The compartment fire felt in the Aux Machinery Room (Engineer). Driven only
// by the Engineer's view (fire.state, fire.smoke) and the shared Fx
// {k:"fire"} events, so it shows nothing the fire panel does not: never where
// it burns, never the order.
//   fire.state "burning" -> smoke seeps from the FIRE PANEL cabinet, rises and
//                           banks under the deckhead (rate/opacity by
//                           fire.smoke); a red/amber rotating FIRE beacon
//                           by the panel with a FIRE ALARM plate (triangle)
//   fx "flare"           -> a brief burst of flame and a gout of smoke at the
//                           panel, an orange flash
//   fx "out"             -> extinguishant puffs from the deckhead nozzle;
//                           state "out": the smoke clears
//   fx "burnout"         -> a fireball flash; state "burnt": a scorched
//                           decal on the bulkhead and deckhead (persists)
// Pools come from fx/pool.ts (fixed budget: smoke 90 + steam 50 + flame 70).
// Quality "low" halves the emission; reduced motion slows and thins it,
// stops the beacon spinning (steady) and softens the flashes.
// Mount (world coordinates) in AuxRoom: <FireFx />.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { onFx, useStore } from "../../store.ts";
import { Pool } from "../fx/pool.ts";
import { PALETTE } from "../palette.ts";
import { At, B, CanvasPlane, ev, G, M, STENCIL } from "./kit.tsx";
import { AUX, AUX_D, FACE } from "./layout.ts";

type V3 = [number, number, number];

/** The FIRE PANEL (AuxRoom.tsx mount): centre on the east bulkhead, aux side. */
const PANEL = { x: AUX.wallW - 0.01, y: 1.45, z: 0.3 } as const;
/** cabinet half-width / top / bottom in world units (Incident.tsx FirePanel) */
const HALF_W = 0.75;
const TOP = PANEL.y + 0.975;
const BOT = PANEL.y - 0.725;
/** smoke banks under the overhead duct run (Dressing: y 2.44..2.8 over z 0.3) */
const CEIL = 2.4;
/** beacon and its plate beside the panel's upper corner, clear of the duct */
const BEACON: V3 = [AUX.wallW - 0.14, TOP - 0.2, PANEL.z - HALF_W - 0.3];
const NOZZLE: V3 = [AUX.wallW - 0.5, AUX.h - 0.12, PANEL.z];

const smoke = new Pool(90);
const steam = new Pool(50);
const flame = new Pool(70, true);

const rnd = (a = 1) => (Math.random() - 0.5) * a;
const RED = new Color(PALETTE.lampRed);
const AMBER = new Color(PALETTE.lampAmber);
const FIREBALL = new Color("#ff7a26");

function settings() {
  const st = useStore.getState();
  return { rm: st.reducedMotion, q: st.quality === "low" ? 0.5 : 1 };
}

/** A smoke puff from a seam of the panel cabinet, drifting out into the room. */
function puffSmoke(dense: number): void {
  const p = smoke.spawn();
  const edge = Math.random();
  // from the cabinet's top edge mostly, some from its sides
  if (edge < 0.6) {
    p.y = TOP - 0.05;
    p.z = PANEL.z + rnd(HALF_W * 2);
  } else {
    p.y = BOT + Math.random() * (TOP - BOT);
    p.z = PANEL.z + (edge < 0.8 ? -HALF_W : HALF_W);
  }
  p.x = PANEL.x - 0.08 - Math.random() * 0.06;
  p.life = 7 + Math.random() * 4;
  p.s = 0.12 + Math.random() * 0.1;
  p.grow = 7;
  p.vx = -0.08 - Math.random() * 0.12;
  p.vy = 0.3 + Math.random() * 0.2;
  p.vz = rnd(0.12);
  p.drag = 0.12;
  p.ceil = CEIL + rnd(0.12);
  // unlit sprites: a mid grey reads as smoke in the dim room
  const g = 0.3 + Math.random() * 0.1;
  p.r = g; p.g = g * 0.97; p.b = g * 0.93;
  p.a = 0.2 + 0.35 * dense;
}

/** Flame tongues and embers licking out of the panel (flare / fireball). */
function burstFlame(n: number, big: boolean): void {
  for (let i = 0; i < n; i++) {
    const p = flame.spawn();
    p.x = PANEL.x - 0.1;
    p.y = PANEL.y + rnd(1.2);
    p.z = PANEL.z + rnd(HALF_W * 1.6);
    const sp = big ? 1.6 + Math.random() * 2.2 : 0.6 + Math.random() * 1.2;
    p.vx = -sp;
    p.vy = (big ? 0.8 : 0.5) + Math.random() * 0.8;
    p.vz = rnd(big ? 2.4 : 1.2);
    p.drag = big ? 1.4 : 2.2;
    p.grav = -0.6;
    p.life = (big ? 0.7 : 0.45) + Math.random() * 0.4;
    p.s = big ? 0.25 + Math.random() * 0.25 : 0.1 + Math.random() * 0.1;
    p.grow = big ? 3.2 : 2.2;
    p.ceil = AUX.h - 0.05;
    p.r = 2.4; p.g = 0.9 + Math.random() * 0.5; p.b = 0.2;
    p.a = big ? 0.9 : 0.8;
  }
}

/** Extinguishant (water mist) puffs from the deckhead nozzle over the panel. */
function puffSteam(n: number): void {
  for (let i = 0; i < n; i++) {
    const p = steam.spawn();
    p.x = NOZZLE[0] + rnd(0.1); p.y = NOZZLE[1]; p.z = NOZZLE[2] + rnd(0.1);
    p.vx = rnd(1.2) - 0.2; p.vy = -0.6 - Math.random() * 0.8; p.vz = rnd(1.6);
    p.drag = 1.1;
    p.grav = -0.15;
    p.life = 1.8 + Math.random() * 1.4;
    p.s = 0.12 + Math.random() * 0.1;
    p.grow = 6;
    p.r = 0.9; p.g = 0.93; p.b = 0.95;
    p.a = 0.38;
  }
}

/** Soot: a dark plume rising from the panel and spreading on the deckhead. */
function sootTexture(kind: "wall" | "ceiling"): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(12,9,7,${a})`);
    g.addColorStop(0.55, `rgba(20,14,10,${a * 0.6})`);
    g.addColorStop(1, "rgba(20,14,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // seeded so every client draws the same marks
  let s = kind === "wall" ? 7 : 13;
  const r01 = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (kind === "wall") {
    // the cabinet hides the middle (x 61..195, y > 78 of 256): soot hugs
    // its sides and top edge and plumes up to the deckhead
    const cab = { l: 61, r: 195, top: 78 };
    for (let i = 0; i < 70; i++) {
      const side = r01();
      const y = cab.top + r01() * (256 - cab.top);
      if (side < 0.5) blob(side < 0.25 ? cab.l - r01() * 26 : cab.r + r01() * 26, y, 14 + r01() * 22, 0.65);
      else {
        const t = r01();
        blob(cab.l + 10 + r01() * (cab.r - cab.l - 20) + (r01() - 0.5) * t * 60, cab.top + 6 - t * (cab.top + 6), 18 + t * 26, 0.75 * (1 - t * 0.3));
      }
    }
    // scorched streaks licking up from the cabinet's top edge and sides
    ctx.strokeStyle = "rgba(10,7,5,0.6)";
    for (let i = 0; i < 18; i++) {
      ctx.lineWidth = 2 + r01() * 5;
      const onTop = i < 12;
      const x = onTop ? cab.l + r01() * (cab.r - cab.l) : i % 2 ? cab.l - 4 : cab.r + 4;
      const y0 = onTop ? cab.top + 4 : cab.top + 30 + r01() * 120;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(x + (r01() - 0.5) * 30, y0 - 30, x + (r01() - 0.5) * 50, y0 - 60, x + (r01() - 0.5) * 70, Math.max(0, y0 - 70 - r01() * 50));
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 50; i++) {
      const a = r01() * Math.PI * 2;
      const d = Math.sqrt(r01()) * 100;
      blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 22 + r01() * 30, 0.4);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A soft cloud texture for the smoke layer banked under the deckhead. */
function cloudTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  let s = 3;
  const r01 = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = r01() * 256;
    const y = r01() * 256;
    const r = 20 + r01() * 50;
    // wrap so the texture tiles
    for (const dx of [-256, 0, 256])
      for (const dy of [-256, 0, 256]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, "rgba(255,255,255,0.22)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** The rotating red/amber FIRE beacon on a bracket beside the panel's top corner. */
function Beacon({ dome, light }: { dome: MeshStandardMaterial; light: RefObject<PointLight | null> }) {
  const m = M();
  return (
    <group position={BEACON}>
      {/* wall bracket */}
      <B p={[0.07, -0.08, 0]} s={[0.14, 0.03, 0.12]} m={m.steel} />
      <mesh geometry={G().cyl} material={m.steel} position={[0, -0.05, 0]} scale={[0.09, 0.05, 0.09]} />
      <mesh geometry={G().sphere} material={dome} position={[0, 0.06, 0]} scale={[0.08, 0.11, 0.08]} />
      <pointLight ref={light} position={[-0.25, 0, 0]} intensity={0} distance={6} decay={1.5} color={PALETTE.lampRed} />
    </group>
  );
}

export function FireFx() {
  const m = M();
  const spin = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const layer = useRef<Group>(null);
  const acc = useRef({ smoke: 0, flash: 0, flashCol: FIREBALL.clone(), seen: false });
  const mats = useMemo(() => {
    const dome = new MeshStandardMaterial({ color: "#4a1410", emissive: PALETTE.lampRed, emissiveIntensity: 0.05, roughness: 0.3, transparent: true, opacity: 0.85 });
    const reflector = new MeshStandardMaterial({ color: "#c9ccd0", emissive: PALETTE.lampAmber, emissiveIntensity: 0, roughness: 0.2, metalness: 0.8 });
    const soot = (kind: "wall" | "ceiling") =>
      new MeshBasicMaterial({ map: sootTexture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true, opacity: 0 });
    const wall = soot("wall");
    const ceiling = soot("ceiling");
    const cloud = new MeshBasicMaterial({ map: cloudTexture(), color: "#6a6660", transparent: true, depthWrite: false, opacity: 0, side: DoubleSide });
    return { dome, reflector, wall, ceiling, cloud };
  }, []);
  useEffect(
    () => () => {
      for (const mt of Object.values(mats)) {
        mt.map?.dispose();
        mt.dispose();
      }
    },
    [mats],
  );

  useEffect(
    () =>
      onFx((fx) => {
        if (fx.k !== "fire") return;
        const { rm, q } = settings();
        const a = acc.current;
        if (fx.ev === "flare") {
          burstFlame(Math.ceil((rm ? 10 : 22) * q), false);
          for (let i = 0; i < 10 * q; i++) puffSmoke(1);
          a.flash = Math.max(a.flash, rm ? 0.4 : 0.8);
          a.flashCol.copy(FIREBALL);
        } else if (fx.ev === "burnout") {
          burstFlame(Math.ceil((rm ? 24 : 60) * q), true);
          for (let i = 0; i < 16 * q; i++) puffSmoke(1);
          a.flash = Math.max(a.flash, rm ? 0.8 : 2);
          a.flashCol.copy(FIREBALL);
        } else if (fx.ev === "out") {
          puffSteam(Math.ceil((rm ? 14 : 30) * q));
        } else if (fx.ev === "step") {
          // an isolator throws: a short puff of extinguishant
          puffSteam(Math.ceil(5 * q));
        }
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const v = ev();
    const { rm, q } = settings();
    const a = acc.current;
    const t = performance.now() / 1000;
    const state = v?.fire.state ?? "idle";
    const burning = state === "burning";
    const dense = burning ? (v?.fire.smoke ?? 0) / 100 : 0;

    // smoke seeping from the panel, thicker with fire.smoke
    if (burning) {
      a.smoke += (1.5 + dense * 9) * q * (rm ? 0.5 : 1) * dt;
      while (a.smoke >= 1) {
        a.smoke -= 1;
        puffSmoke(dense);
      }
    } else a.smoke = 0;
    // under the deckhead it spreads out across the room (westwards, away from the bulkhead)
    for (const p of smoke.parts) {
      if (!p.alive) continue;
      if (p.y >= p.ceil - 0.02) p.vx -= (rm ? 0.05 : 0.12) * dt;
      if (p.x < AUX.minX + 0.4) p.vx = Math.abs(p.vx) * 0.3;
    }
    // state "out": the smoke clears quickly; after a flashover it thins slowly
    if (state === "out") smoke.fade(Math.exp(-dt * 0.9));
    else if (state === "burnt") smoke.fade(Math.exp(-dt * 0.15));

    // the smoke layer banked under the deckhead
    const layerTarget = burning ? Math.min(0.75, 0.1 + dense * 0.8) : state === "burnt" ? 0.18 : 0;
    const cl = mats.cloud;
    cl.opacity += (layerTarget - cl.opacity) * Math.min(1, dt * (layerTarget > cl.opacity ? 0.25 : 0.4));
    if (cl.map && !rm) {
      cl.map.offset.x = (cl.map.offset.x + dt * 0.012) % 1;
      cl.map.offset.y = (cl.map.offset.y + dt * 0.004) % 1;
    }
    if (layer.current) layer.current.visible = cl.opacity > 0.005;

    // the beacon: a rotating reflector sweeps red then amber
    const ang = rm ? 0 : t * 5.5;
    if (spin.current && burning) spin.current.rotation.y = ang;
    const sweep = rm ? 1 : 0.5 + 0.5 * Math.max(0, Math.cos(ang));
    const amberHalf = !rm && Math.sin(ang) > 0;
    mats.dome.emissive.copy(amberHalf ? AMBER : RED);
    mats.dome.emissiveIntensity = burning ? 0.8 + 2 * sweep : 0.04;
    mats.reflector.emissiveIntensity = burning ? 1.2 * sweep : 0;

    // the scorch is state, so it is there after a reload too (no fade-in
    // on the first frame), and gone when a new voyage starts
    const sootTarget = state === "burnt" ? 1 : 0;
    mats.wall.opacity = a.seen ? mats.wall.opacity + (sootTarget - mats.wall.opacity) * Math.min(1, dt * 0.8) : sootTarget;
    mats.ceiling.opacity = mats.wall.opacity;
    a.seen = !!v;

    // one light: the beacon's sweep, plus flare / fireball flashes
    a.flash = Math.max(0, a.flash - dt * (rm ? 1.2 : 2.2));
    const L = light.current;
    if (L) {
      const beaconI = burning ? 1.6 * sweep * (rm ? 0.6 : 1) : 0;
      const flick = rm ? 1 : 0.8 + 0.2 * Math.sin(t * 47) * Math.sin(t * 13);
      const flashI = a.flash * 14 * flick;
      L.intensity = beaconI + flashI;
      if (flashI > beaconI) L.color.copy(a.flashCol);
      else L.color.copy(amberHalf ? AMBER : RED);
    }

    smoke.update(dt);
    steam.update(dt);
    flame.update(dt);
  });

  return (
    <group>
      <primitive object={smoke.mesh} />
      <primitive object={steam.mesh} />
      <primitive object={flame.mesh} />
      <group>
        <Beacon dome={mats.dome} light={light} />
        <group ref={spin} position={[BEACON[0], BEACON[1] + 0.06, BEACON[2]]}>
          <mesh geometry={G().box} material={mats.reflector} position={[0, 0, 0.035]} scale={[0.06, 0.08, 0.012]} />
        </group>
        <At p={[AUX.wallW - 0.012, BEACON[1] - 0.28, BEACON[2] - 0.05]} r={[0, FACE.east, 0]}>
          <FirePlate />
        </At>
      </group>
      {/* extinguishant nozzle on the deckhead over the panel (fed by the isolators) */}
      <B p={[NOZZLE[0], NOZZLE[1] + 0.06, NOZZLE[2]]} s={[0.05, 0.12, 0.05]} m={m.pipe} />
      <B p={[NOZZLE[0], NOZZLE[1] - 0.01, NOZZLE[2]]} s={[0.1, 0.04, 0.1]} m={m.brass} />
      {/* soot over the panel and on the deckhead above it (after a flashover) */}
      <mesh material={mats.wall} position={[AUX.wallW - 0.006, (BOT + 0.4 + AUX.h) / 2, PANEL.z]} rotation={[0, FACE.east, 0]} scale={[2.9, AUX.h - BOT - 0.4, 1]}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh material={mats.ceiling} position={[AUX.wallW - 0.9, AUX.h - 0.006, PANEL.z]} rotation={[Math.PI / 2, 0, 0]} scale={[1.8, 2.4, 1]}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {/* the banked smoke layer (two sheets) */}
      <group ref={layer}>
        <mesh material={mats.cloud} position={[(AUX.minX + AUX.maxX) / 2, CEIL + 0.05, (AUX.minZ + AUX.maxZ) / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[AUX.maxX - AUX.minX, AUX_D, 1]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh material={mats.cloud} position={[(AUX.minX + AUX.maxX) / 2, CEIL - 0.18, (AUX.minZ + AUX.maxZ) / 2]} rotation={[Math.PI / 2, 0, 0.6]} scale={[AUX.maxX - AUX.minX, AUX_D, 1]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  );
}

/** "FIRE" beside a warning triangle, with its state word (shape + words,
 * never colour alone); the plate lights while burning. */
function FirePlate() {
  const state = useStore((s) => (s.view && s.view.you === "ENGINEER" ? s.view.fire.state : "idle"));
  const burning = state === "burning";
  const word = state === "burnt" ? "FLASHOVER" : state === "out" ? "FIRE OUT" : "FIRE ALARM";
  return (
    <CanvasPlane
      w={0.56}
      h={0.14}
      glow={burning ? 1.1 : 0.45}
      deps={[word, burning]}
      draw={(ctx, W, H) => {
        ctx.fillStyle = burning ? "#6a1810" : PALETTE.plateBg;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = PALETTE.hazardYellow;
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, W - 8, H - 8);
        // warning triangle with an exclamation bar
        ctx.fillStyle = PALETTE.hazardYellow;
        ctx.beginPath();
        ctx.moveTo(H * 0.55, H * 0.14);
        ctx.lineTo(H * 0.98, H * 0.86);
        ctx.lineTo(H * 0.12, H * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(H * 0.5, H * 0.38, H * 0.1, H * 0.28);
        ctx.fillRect(H * 0.5, H * 0.71, H * 0.1, H * 0.08);
        ctx.fillStyle = PALETTE.plateText;
        ctx.font = `900 ${Math.round(H * 0.5)}px ${STENCIL}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(word, H * 1.15, H * 0.54);
      }}
    />
  );
}
