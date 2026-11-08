// Particle effects for the engine rooms, all pooled and instanced (fx/pool.ts,
// one draw call per pool, fixed budget: steam 110 + smoke 40 + spray 90 +
// drips 40 + sparks 90 = 370). spawnSteam/spawnSparks stay module-level so fx
// handlers can call them. Continuous emitters are tied to view fields:
//   hull spray   <- flood.engineLevel (+ ship.lost.ENGINE, "breach"/"burst" fx)
//   pipe drips   <- danger (rate), splashes on the water surface
//   steam leaks  <- grid.heat (lagged pipes), "overheat" fx
//   sparks       <- power.tripped / power.load (switchboard), grid.tripped /
//                   grid.load vs grid.output (aux generator)
//   smoke haze   <- grid.heat > 65 (generator, aux set)
//   brownout     <- change of power.load / grid.load (kicks.dip)
// Also holds the light "kicks" Lighting reads. Reduced motion: fewer, slower
// particles; quality "low": fewer again.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { onFx, useStore } from "../../store.ts";
import { Atmosphere } from "../fx/Atmosphere.tsx";
import { motion, Pool } from "../fx/pool.ts";
import { auxOpenNow } from "./AuxRoom.tsx";
import { ev, shipLive } from "./kit.tsx";
import { auxExhaustWorld, auxGenWorld, AT, ROOM, switchboardWorld } from "./layout.ts";
import { waterNow } from "./Water.tsx";

type V3 = [number, number, number];

const STEAM_N = 110;
const SMOKE_N = 40;
const SPRAY_N = 90;
const DRIP_N = 40;
const SPARK_N = 90;

/** Light kicks read (and decayed) by Lighting: dip darkens, flash brightens.
 * shudder (hull breach) shakes the room; decayed in EngineRoom. */
export const kicks = { dip: 0, flash: 0, hum: 0, contact: 0, arc: 0, shudder: 0 };

// Pools are created once at module load (no allocation afterwards).
const steam = new Pool(STEAM_N);
const smoke = new Pool(SMOKE_N);
const spray = new Pool(SPRAY_N);
const drips = new Pool(DRIP_N);
const sparks = new Pool(SPARK_N, true);

const rnd = (a = 1) => (Math.random() - 0.5) * a;

function reduced(): boolean {
  return useStore.getState().reducedMotion;
}
function lowQ(): boolean {
  return useStore.getState().quality === "low";
}

/** A burst of steam at `at`, blowing roughly along `dir`. */
export function spawnSteam(at: V3, dir: V3 = [0, 1, 0], count = 14): void {
  const n = reduced() ? Math.ceil(count / 2) : count;
  for (let i = 0; i < n; i++) {
    const p = steam.spawn();
    p.life = 1.4 + Math.random() * 1.2;
    p.s = 0.1 + Math.random() * 0.1;
    p.grow = 5;
    p.x = at[0] + rnd(0.1); p.y = at[1] + rnd(0.1); p.z = at[2] + rnd(0.1);
    p.vx = dir[0] * (0.6 + Math.random()) + rnd(0.6);
    p.vy = dir[1] * (0.6 + Math.random()) + 0.5 + Math.random() * 0.4;
    p.vz = dir[2] * (0.6 + Math.random()) + rnd(0.6);
    p.drag = 1.4;
    p.grav = -0.25;
    p.r = 0.9; p.g = 0.93; p.b = 0.94;
    p.a = 0.4;
  }
}

/** A shower of sparks at `at`. */
export function spawnSparks(at: V3, count = 24): void {
  const n = reduced() ? Math.ceil(count / 2) : count;
  for (let i = 0; i < n; i++) {
    const s = sparks.spawn();
    s.life = 0.4 + Math.random() * 0.6;
    s.s = 0.018 + Math.random() * 0.012;
    s.grow = 0.2;
    s.x = at[0]; s.y = at[1]; s.z = at[2];
    s.vx = rnd(3); s.vy = Math.random() * 2.2; s.vz = (Math.random() - 0.2) * 2.4;
    s.grav = 9;
    s.floor = 0.02;
    s.r = 2.2; s.g = 1.5; s.b = 0.6;
    s.a = 1;
  }
}

function spawnSmoke(at: V3, count = 1): void {
  for (let i = 0; i < count; i++) {
    const p = smoke.spawn();
    p.life = 3 + Math.random() * 2;
    p.s = 0.25 + Math.random() * 0.2;
    p.grow = 4;
    p.x = at[0] + rnd(0.5); p.y = at[1]; p.z = at[2] + rnd(0.5);
    p.vx = rnd(0.2); p.vy = 0.25 + Math.random() * 0.2; p.vz = rnd(0.2);
    p.drag = 0.5;
    p.r = 0.13; p.g = 0.12; p.b = 0.12;
    p.a = 0.28;
  }
}

/** A jet of water from a hull seam on the walls, aimed into the room. */
function spawnSprayJet(x: number, y: number, z: number, nx: number, nz: number, force: number): void {
  const p = spray.spawn();
  p.life = 0.5 + Math.random() * 0.4;
  p.s = 0.03 + Math.random() * 0.03;
  p.grow = 1.6;
  p.x = x; p.y = y; p.z = z;
  const sp = 1.5 + force * 2.5 + Math.random();
  p.vx = nx * sp + rnd(0.4); p.vy = 0.8 + Math.random() * 0.8; p.vz = nz * sp + rnd(0.4);
  p.grav = 9;
  p.floor = waterNow.h;
  p.land = true;
  p.r = 0.7; p.g = 0.85; p.b = 0.9;
  p.a = 0.8;
}

function splash(x: number, z: number, n = 2): void {
  for (let i = 0; i < n; i++) {
    const p = spray.spawn();
    p.life = 0.35;
    p.s = 0.02;
    p.grow = 1.4;
    p.x = x; p.y = waterNow.h + 0.01; p.z = z;
    p.vx = rnd(0.6); p.vy = 0.6 + Math.random() * 0.5; p.vz = rnd(0.6);
    p.grav = 9;
    p.floor = waterNow.h - 0.01;
    p.r = 0.8; p.g = 0.9; p.b = 0.95;
    p.a = 0.7;
  }
}
spray.onLand = (p) => splash(p.x, p.z, 1);
drips.onLand = (p) => splash(p.x, p.z, 2);

function spawnDrip(x: number, y: number, z: number): void {
  const p = drips.spawn();
  p.life = 2;
  p.s = 0.014;
  p.x = x; p.y = y; p.z = z;
  p.vx = 0; p.vy = 0; p.vz = 0;
  p.grav = 9;
  p.floor = waterNow.h;
  p.land = true;
  p.r = 0.6; p.g = 0.8; p.b = 0.9;
  p.a = 0.9;
}

/** Hull seams along the north/south walls (x, wall z, inward normal z). */
const SEAMS: [number, number, number][] = [
  [-2.2, ROOM.minZ + 0.05, 1],
  [3.8, ROOM.minZ + 0.05, 1],
  [1.6, ROOM.maxZ - 0.05, -1],
  [-3.5, ROOM.maxZ - 0.05, -1],
];
/** Leaking joints in the overhead pipe runs. */
const JOINTS: V3[] = [
  [-2.6, 2.75, -1.8],
  [0.4, 2.75, 1.2],
  [3.1, 2.75, -0.5],
  [-4.2, 2.7, 2.5],
];
/** Lagged pipe flanges that vent steam as the plant heats. */
const LEAKS: { at: V3; dir: V3 }[] = [
  { at: [-4.45, 1.9, 0.9], dir: [1, 0.2, 0] },
  { at: [-3.6, 2.55, 1.9], dir: [0, 0.3, -1] },
  { at: auxExhaustWorld, dir: [0.3, 1, 0.3] },
];
const GEN_SMOKE: V3 = [AT.generator[0] + 0.2, 1.7, AT.generator[2]];
const AUX_SMOKE: V3 = [auxGenWorld[0] - 0.3, 1.9, auxGenWorld[2]];

const acc = { spray: 0, drip: 0, steam: 0, smoke: 0, spark: 0 };
const last = { load: -1, gload: -1, trip: false, gtrip: false };

export function Effects() {
  // a breach/burst is a strong one-off spray from the hull
  useEffect(
    () =>
      onFx((fx) => {
        if (fx.k === "breach" || fx.k === "burst" || fx.k === "compartmentLost") {
          const seam = SEAMS[Math.floor(Math.random() * SEAMS.length)];
          const n = reduced() ? 10 : 36;
          for (let i = 0; i < n; i++) spawnSprayJet(seam[0] + rnd(0.3), 0.8 + Math.random() * 1.2, seam[1], 0, seam[2], 1);
          motion.jolt = Math.max(motion.jolt, fx.k === "compartmentLost" ? 1 : 0.7);
        }
      }),
    [],
  );
  const meshes = useMemo(() => [smoke.mesh, steam.mesh, spray.mesh, drips.mesh, sparks.mesh], []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const v = ev();
    const rm = reduced();
    const q = lowQ() ? 0.5 : 1;
    const rate = (rm ? 0.4 : 1) * q;
    if (v) {
      const live = shipLive(v.phase);
      const danger = v.danger / 100;
      const level = live ? Math.min(100, v.flood.engineLevel) / 100 : 0;
      const lost = v.ship.lost.ENGINE;
      // hull seams spray as the engine compartment floods
      const sprayRate = lost ? 14 : live && level > 0.12 ? level * 18 : 0;
      acc.spray += sprayRate * rate * dt;
      while (acc.spray >= 1) {
        acc.spray -= 1;
        const s = SEAMS[Math.floor(Math.random() * SEAMS.length)];
        spawnSprayJet(s[0] + rnd(0.1), 0.5 + Math.random() * 0.7, s[1], 0, s[2], level);
      }
      // pipe joints drip more as danger rises
      acc.drip += (0.4 + danger * 9) * (v.phase === "LOBBY" ? 0 : 1) * rate * dt;
      while (acc.drip >= 1) {
        acc.drip -= 1;
        const j = JOINTS[Math.floor(Math.random() * JOINTS.length)];
        spawnDrip(j[0] + rnd(0.05), j[1], j[2] + rnd(0.05));
      }
      const auxOn = auxOpenNow();
      const heat = v.grid.heat / 100;
      // steam leaks from lagged pipes as the generator heats
      if (heat > 0.5 && live) {
        acc.steam += (heat - 0.45) * 12 * rate * dt;
        while (acc.steam >= 1) {
          acc.steam -= 1;
          const l = LEAKS[Math.floor(Math.random() * (auxOn ? LEAKS.length : LEAKS.length - 1))];
          spawnSteam(l.at, l.dir, 1);
        }
      }
      // smoke haze at high heat
      if (heat > 0.65 && live) {
        acc.smoke += (heat - 0.6) * 8 * rate * dt;
        while (acc.smoke >= 1) {
          acc.smoke -= 1;
          spawnSmoke(auxOn && Math.random() < 0.5 ? AUX_SMOKE : GEN_SMOKE);
        }
      }
      // sparks from the switchboard / aux generator when overloaded or tripped
      const swHot = v.power.tripped || v.power.load > 85;
      const auxHot = auxOn && live && (v.grid.tripped || v.grid.load > v.grid.output * 0.95);
      if (swHot || auxHot) {
        acc.spark += (v.power.tripped || v.grid.tripped ? 1.6 : 0.8) * rate * dt;
        while (acc.spark >= 1) {
          acc.spark -= 1;
          if (swHot && (!auxHot || Math.random() < 0.5)) spawnSparks(switchboardWorld, 4);
          else spawnSparks(auxGenWorld, 4);
        }
      }
      // brownout when the load changes noticeably, a longer one on trips
      const load = v.power.load;
      const gload = v.grid.load;
      if (last.load >= 0 && (Math.abs(load - last.load) > 12 || Math.abs(gload - last.gload) > 12)) kicks.dip = Math.max(kicks.dip, 0.3);
      if (v.power.tripped && !last.trip) kicks.dip = Math.max(kicks.dip, 0.6);
      if (v.grid.tripped && !last.gtrip) kicks.dip = Math.max(kicks.dip, 0.6);
      last.load = load; last.gload = gload; last.trip = v.power.tripped; last.gtrip = v.grid.tripped;
    }
    steam.update(dt);
    smoke.update(dt);
    spray.update(dt);
    drips.update(dt);
    sparks.update(dt);
  });

  return (
    <group>
      <Atmosphere w={10} d={8} h={3} />
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}
