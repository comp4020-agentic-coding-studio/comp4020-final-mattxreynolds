// The procedural exterior for the cinematic bookends: a storm at night over
// a moving sea, the MV Kestrel Meridian riding it, the vessel that runs her
// down, and the lifeboat. Everything is a pure function of `t` (seconds since
// the sequence began), so a frame can be reproduced exactly; the camera comes
// from the shot list in timeline.ts.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  type DirectionalLight,
  Euler,
  type Fog,
  type Group,
  InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type PointLight,
  Quaternion,
  SphereGeometry,
  type Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { cinematicCue } from "../../audio.ts";
import { useStore } from "../../store.ts";
import { boltMat, fadeMat, frameMat, halo, paneMat, rain, rainGeometry, SEA_Y, sea, sky, spray, sprayGeometry, SURF, waveHeight } from "./materials.ts";
import { DAVIT, hullGeometry, lifeboatParts, paneGeometry, shipPanes, shipParts } from "./models.ts";
import { kick, ramp, sampleShot, type Sequence, SEQUENCES, type ShotSample, shakeAt, T_HIT, transitions } from "./timeline.ts";

declare global {
  interface Window {
    /** Dev/test only (scripts/screenshot.ts): hold the cinematic at this many seconds. */
    __btwCineClock?: number;
  }
}

/** Seconds into the sequence. A screenshot run may pin the clock. */
export function cinematicTime(start: number): number {
  const pinned = typeof window !== "undefined" ? window.__btwCineClock : undefined;
  if (typeof pinned === "number") return pinned;
  // the clock holds at 0 until the scene's shaders have compiled (see below)
  const held = warmedAt.get(start);
  return held === undefined ? 0 : performance.now() / 1000 - Math.max(start, held);
}
/** start -> performance.now()/1000 when that cinematic's programs were ready. */
const warmedAt = new Map<number, number>();

// ---- the ship's motion: a pure function of the sequence and t ------------------

type Pose = { x: number; z: number; sink: number; list: number; trim: number; yaw: number; swell: number };

function swellAt(seq: Sequence, t: number): number {
  if (seq === "intro") return 0.95 + ramp(t, 4, 18) * 0.45;
  if (seq === "survived") return 1.2 - ramp(t, 6, 19) * 0.75;
  return 1.15;
}

function shipPose(seq: Sequence, t: number, out: Pose): Pose {
  out.swell = swellAt(seq, t);
  out.z = 0;
  if (seq === "intro") {
    out.x = -8 + t * 0.6;
    const after = ramp(t, T_HIT, T_HIT + 9);
    out.sink = after * 0.7;
    // struck on the starboard bow: thrown to port, then she settles to starboard
    out.list = after * 0.07 - kick(t, T_HIT, 1.6, 3.2) * 0.14;
    out.trim = after * 0.035 + kick(t, 8.2, 2.2, 3) * 0.07 + kick(t, 10.7, 2.2, 3) * 0.08 + kick(t, 17.6, 2.2, 3) * 0.05;
    out.yaw = ramp(t, T_HIT, T_HIT + 2.5) * 0.09;
  } else if (seq === "survived") {
    out.x = 0;
    out.sink = 0.8 + ramp(t, 0, 10) * 1.4 + ramp(t, 9.5, 17.5) * 10;
    out.trim = 0.05 + ramp(t, 0, 10) * 0.07 + ramp(t, 9.5, 16.5) * 0.3;
    out.list = -0.1 * ramp(t, 0, 14);
    out.yaw = 0;
  } else {
    out.x = 0;
    out.sink = 0.5 + ramp(t, 0, 6) * 1.6 + ramp(t, 7.5, 13.5) * 3.2 + ramp(t, 10.5, 13.6) * 6;
    out.list = 0.2 + 0.3 * ramp(t, 0, 10);
    out.trim = 0.06 + 0.18 * ramp(t, 2, 13);
    out.yaw = 0;
  }
  return out;
}

const _e = new Euler(0, 0, 0, "YXZ");
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();
/** World matrix of the ship at t (heave, roll and pitch ride the swell). */
function shipMatrix(seq: Sequence, t: number, pose: Pose, out: Matrix4): Matrix4 {
  shipPose(seq, t, pose);
  const { x, z, swell } = pose;
  const hb = waveHeight(x + 10, z, t, swell);
  const hs = waveHeight(x - 10, z, t, swell);
  const hp = waveHeight(x, z - 2.5, t, swell);
  const hst = waveHeight(x, z + 2.5, t, swell);
  const damp = 0.55;
  _p.set(x, SEA_Y + ((hb + hs + hp + hst) / 4) * damp - pose.sink, z);
  _e.set(Math.atan2(hst - hp, 5) * damp + pose.list, pose.yaw, Math.atan2(hb - hs, 20) * damp - pose.trim);
  return out.compose(_p, _q.setFromEuler(_e), _s);
}

// ---- the other vessel (intro) ----------------------------------------------------

/** Her heading, and her bow's path to our starboard bow. */
const OTHER_DIR = new Vector3(-0.5, 0, -0.866);
const OTHER_YAW = Math.atan2(-OTHER_DIR.z, OTHER_DIR.x);
const OTHER_SCALE = 1.1;
const OTHER_BOW = 14.3 * OTHER_SCALE;
function otherBow(t: number, out: Vector3): Vector3 {
  const contact = _p.set(-8 + T_HIT * 0.6 + 10.5, 0, 2.7);
  // closing at speed; after the blow she stops dead and falls back
  const d = t < T_HIT ? (t - T_HIT) * (2.4 + (T_HIT - t) * 0.35) : -(1 - Math.exp(-(t - T_HIT) * 0.6)) * 2.2;
  return out.copy(contact).addScaledVector(OTHER_DIR, d);
}

// ---- lights ------------------------------------------------------------------------

/** A failing circuit: stutters, then holds dark. Reduced motion just fades. */
function failing(t: number, at: number, reduced: boolean, salt: number): number {
  if (t < at - 0.7) return 1;
  if (t > at) return 0;
  if (reduced) return (at - t) / 0.7;
  return Math.sin(t * (37 + salt * 11)) + Math.sin(t * (23 + salt * 5)) > 0.3 ? 0.9 : 0.06;
}

/** Main (warm) and emergency (red) power at ship-x, before the water takes it. */
function power(seq: Sequence, t: number, x: number, salt: number, reduced: boolean, out: { main: number; red: number }) {
  const fromBow = (12.5 - x) / 25; // 0 at the stem, 1 at the stern
  if (seq === "intro") {
    if (t < T_HIT) {
      out.main = 1;
      out.red = 0;
    } else if (t < T_HIT + 0.9) {
      out.main = reduced ? 0.6 : Math.sin(t * (53 + salt * 7)) > 0 ? 1 : 0.1;
      out.red = 0;
    } else {
      out.main = failing(t, T_HIT + 1.9 + fromBow * 2.4, reduced, salt);
      out.red = ramp(t, T_HIT + 4.5, T_HIT + 5.1);
    }
  } else if (seq === "survived") {
    out.main = 0;
    out.red = 0.85 * failing(t, 8.5 + fromBow * 4, reduced, salt);
  } else {
    out.main = 0;
    out.red = failing(t, 3 + fromBow * 6.5, reduced, salt);
  }
  return out;
}

type NavLamp = { p: [number, number, number]; color: string; size: number; /** visible arc: local direction it shows toward, cos limit */ face?: [number, number, number]; cos?: number; kind: "nav" | "flood" };
const LAMPS: NavLamp[] = [
  { p: [10.2, 8.55, 0], color: "#fff6e0", size: 1.5, face: [1, 0, 0], cos: -0.38, kind: "nav" }, // forward masthead
  { p: [-7.6, 8.75, 0], color: "#fff6e0", size: 1.5, face: [1, 0, 0], cos: -0.38, kind: "nav" }, // main masthead
  { p: [-6.2, 5.6, 3.4], color: "#3dff7a", size: 1.4, face: [0.38, 0, 0.92], cos: 0.1, kind: "nav" }, // starboard: green
  { p: [-6.2, 5.6, -3.4], color: "#ff3a2a", size: 1.4, face: [0.38, 0, -0.92], cos: 0.1, kind: "nav" }, // port: red
  { p: [-12.05, 2.5, 0], color: "#fff6e0", size: 1.0, face: [-1, 0, 0], cos: 0.38, kind: "nav" }, // stern light
  { p: [4.2, 6.3, -0.6], color: "#ffd59a", size: 2.2, kind: "flood" },
  { p: [0.1, 4.5, -1.6], color: "#ffd59a", size: 1.6, kind: "flood" },
  { p: [-5.5, 4.95, 2.6], color: "#ffd59a", size: 1.4, kind: "flood" },
  { p: [10.1, 7.1, 0.9], color: "#ffd59a", size: 1.4, kind: "flood" },
];
/** The other ship's lights: we see both sidelights head-on, so she's coming straight at us. */
const OTHER_LAMPS: NavLamp[] = [
  { p: [10.2, 8.55, 0], color: "#fff6e0", size: 1.6, face: [1, 0, 0], cos: -0.38, kind: "nav" },
  { p: [-7.6, 8.75, 0], color: "#fff6e0", size: 1.6, face: [1, 0, 0], cos: -0.38, kind: "nav" },
  { p: [-6.2, 5.6, 3.4], color: "#3dff7a", size: 1.5, face: [0.38, 0, 0.92], cos: 0.1, kind: "nav" },
  { p: [-6.2, 5.6, -3.4], color: "#ff3a2a", size: 1.5, face: [0.38, 0, -0.92], cos: 0.1, kind: "nav" },
  { p: [-5.3, 5.2, 0], color: "#ffd59a", size: 2.4, kind: "flood" },
  { p: [3, 4.5, 0], color: "#ffd59a", size: 1.6, kind: "flood" },
];

// ---- scene -------------------------------------------------------------------------

const WARM = new Color(1, 0.78, 0.46);
const RED = new Color(1, 0.09, 0.04);
const DARK = new Color(0.025, 0.03, 0.035);
const STEM = new Vector3(13.6, 1.4, 0.9);

export function CinematicScene({ shot: seq, start }: { shot: Sequence; start: number }) {
  const { camera, scene, size } = useThree();
  const quality = useStore((s) => s.quality);
  const tier = quality === "high" ? "high" : "low";
  const refs = {
    ship: useRef<Group>(null),
    other: useRef<Group>(null),
    boat: useRef<Group>(null),
    bolt: useRef<Mesh>(null),
    flash: useRef<DirectionalLight>(null),
    fog: useRef<Fog>(null),
    fade: useRef<Mesh>(null),
    sprayPts: useRef<Mesh>(null),
    fallA: useRef<Mesh>(null),
    fallB: useRef<Mesh>(null),
    deckA: useRef<PointLight>(null),
    deckB: useRef<PointLight>(null),
    emergency: useRef<PointLight>(null),
    redDeck: useRef<PointLight>(null),
    boatLight: useRef<PointLight>(null),
    otherLight: useRef<PointLight>(null),
    strobe: useRef<Sprite>(null),
  };
  const geo = useMemo(() => {
    const seaG = new PlaneGeometry(420, 420, tier === "high" ? 190 : 120, tier === "high" ? 190 : 120);
    seaG.rotateX(-Math.PI / 2);
    const panes = shipPanes();
    return {
      sea: seaG,
      sky: new SphereGeometry(300, 32, 16),
      rain: rainGeometry(tier === "high" ? 2200 : 1100),
      spray: sprayGeometry(tier === "high" ? 420 : 200),
      hull: hullGeometry(),
      parts: shipParts(),
      boat: lifeboatParts(),
      pane: paneGeometry(),
      panes,
      bolts: [1, 2, 3, 4].map(boltGeometry),
      bulb: new SphereGeometry(0.12, 8, 6),
      rod: new BoxGeometry(1, 1, 1),
    };
  }, [tier]);
  const mats = useMemo(
    () => ({
      lamp: LAMPS.map((l) => new SpriteMaterial({ map: halo(), color: l.color, blending: AdditiveBlending, depthWrite: false, transparent: true })),
      other: OTHER_LAMPS.map((l) => new SpriteMaterial({ map: halo(), color: l.color, blending: AdditiveBlending, depthWrite: false, transparent: true })),
      bulb: LAMPS.map((l) => new MeshBasicMaterial({ color: l.color })),
      strobe: new SpriteMaterial({ map: halo(), color: "#ff2a1a", blending: AdditiveBlending, depthWrite: false, transparent: true }),
      boatLamp: new SpriteMaterial({ map: halo(), color: "#ffe6b8", blending: AdditiveBlending, depthWrite: false, transparent: true }),
    }),
    [],
  );
  // window instances: placed once in ship space, recoloured each frame
  const paneMesh = useMemo(() => {
    const m = new InstancedMesh(geo.pane, paneMat, geo.panes.length);
    const o = new Matrix4();
    const qq = new Quaternion();
    geo.panes.forEach((p, i) => {
      qq.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...p.n));
      m.setMatrixAt(i, o.compose(new Vector3(...p.p), qq, new Vector3(p.w, p.h, 1)));
      m.setColorAt(i, DARK);
    });
    m.frustumCulled = false;
    return m;
  }, [geo]);
  /** window recesses: a dark surround a little larger than each pane, just proud of the wall */
  const recessMesh = useMemo(() => {
    const m = new InstancedMesh(geo.pane, frameMat, geo.panes.length);
    const o = new Matrix4();
    const qq = new Quaternion();
    geo.panes.forEach((p, i) => {
      const n = new Vector3(...p.n);
      qq.setFromUnitVectors(new Vector3(0, 0, 1), n);
      const pad = p.kind === 0 ? 0.07 : 0.1;
      m.setMatrixAt(i, o.compose(new Vector3(...p.p).addScaledVector(n, -0.006), qq, new Vector3(p.w + pad, p.h + pad, 1)));
    });
    return m;
  }, [geo]);
  /** cabins asleep at 02:14: a fixed half of the accommodation is dark */
  const awake = useMemo(() => geo.panes.map((p, i) => p.kind !== 1 || (i * 7919) % 13 < 7), [geo]);
  const otherPanes = useMemo(() => {
    const m = new InstancedMesh(geo.pane, paneMat, 7);
    const o = new Matrix4();
    for (let i = 0; i < 7; i++) {
      m.setMatrixAt(i, o.compose(new Vector3(-5.53, 5.55, -1.59 + i * 0.528), new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(1, 0, 0)), new Vector3(0.44, 0.6, 1)));
      m.setColorAt(i, new Color(0.9, 0.7, 0.42).multiplyScalar(i % 3 === 1 ? 0.15 : 0.8));
    }
    return m;
  }, [geo]);

  useEffect(
    () => () => {
      for (const g of [geo.sea, geo.sky, geo.rain, geo.spray, geo.hull, geo.boat.hull, geo.boat.canopy, geo.pane, geo.bulb, geo.rod, ...geo.bolts, ...Object.values(geo.parts)]) g.dispose();
      paneMesh.dispose();
      recessMesh.dispose();
      otherPanes.dispose();
      [...mats.lamp, ...mats.other, ...mats.bulb, mats.strobe, mats.boatLamp].forEach((m) => m.dispose());
    },
    [geo, mats, paneMesh, recessMesh, otherPanes],
  );

  // Compile every program off the main thread before the first visible frame
  // (KHR_parallel_shader_compile), as bridge/kit.tsx Warm does: a synchronous
  // link of the sea/sky/standard materials froze a software-rendered page for
  // 2-4 s when an ending mounted. Until then the root is hidden (black) and
  // the cinematic clock holds at 0, so no shot or caption is lost.
  const root = useRef<Group>(null);
  const gl = useThree((x) => x.gl);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    let live = true;
    const hidden: Object3D[] = [];
    g.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const done = () => {
      if (!live) return;
      if (!warmedAt.has(start)) warmedAt.set(start, performance.now() / 1000);
      if (root.current) root.current.visible = true;
    };
    gl.compileAsync(g, camera, scene).catch(() => undefined).then(done);
    for (const o of hidden) o.visible = false;
    if (!warmedAt.has(start)) g.visible = false;
    // never strand the cinematic on a renderer that can't report completion
    const cap = setTimeout(done, 6000);
    if (warmedAt.size > 8) warmedAt.delete(warmedAt.keys().next().value!);
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, [gl, camera, scene, start, tier]);

  const st = useMemo(
    () => ({
      pose: { x: 0, z: 0, sink: 0, list: 0, trim: 0, yaw: 0, swell: 1 } as Pose,
      m: new Matrix4(),
      inv: new Matrix4(),
      rel: new Matrix4(),
      sample: { pos: new Vector3(), look: new Vector3() } as ShotSample,
      v: new Vector3(),
      w: new Vector3(),
      fwd: new Vector3(),
      boatPos: new Vector3(),
      color: new Color(),
      pw: { main: 0, red: 0 },
      lastT: -1,
      lastStrike: -1,
    }),
    [],
  );

  useFrame(() => {
    const t = Math.max(0, cinematicTime(start));
    const reduced = useStore.getState().reducedMotion;
    const def = SEQUENCES[seq];
    const R = refs;
    const cam = camera as PerspectiveCamera;

    // ---- sea, sky, weather
    const swell = swellAt(seq, t) * (reduced ? 0.6 : 1);
    sea.uniforms.t.value = t;
    sea.uniforms.swell.value = swell;
    sky.uniforms.t.value = t;
    rain.uniforms.t.value = t;
    rain.uniforms.fall.value = reduced ? 0.45 : 1;
    const dawn = seq === "survived" ? ramp(t, 9, 20) * 0.8 : 0;
    rain.uniforms.density.value = (reduced ? 0.4 : 1) * (seq === "intro" ? 0.45 + ramp(t, 5, 16) * 0.55 : seq === "survived" ? 1 - ramp(t, 6, 16) * 0.95 : 1);
    sea.uniforms.dawn.value = dawn;
    sky.uniforms.cloud.value = 1 - dawn * 0.35;

    // ---- the ship
    const ship = R.ship.current!;
    shipMatrix(seq, t, st.pose, st.m);
    if (reduced) st.pose.swell *= 0.6;
    st.m.decompose(ship.position, ship.quaternion, ship.scale);
    ship.updateMatrixWorld();
    ship.visible = ship.position.y > -14;
    sea.uniforms.shipPos.value.copy(ship.position);

    // ---- the other vessel
    const other = R.other.current!;
    other.visible = seq === "intro" && t > 11.9;
    if (other.visible) {
      otherBow(t, st.v);
      const hb = waveHeight(st.v.x, st.v.z, t, swell);
      other.position.copy(st.v).addScaledVector(OTHER_DIR, -OTHER_BOW);
      other.position.y = SEA_Y + hb * 0.4 + 0.2;
      other.rotation.set(Math.sin(t * 0.7) * 0.05 + kick(t, T_HIT, 1.8, 3) * 0.08, OTHER_YAW, Math.sin(t * 0.9 + 1) * 0.03 - kick(t, T_HIT, 2, 3) * 0.06, "YXZ");
      other.scale.setScalar(OTHER_SCALE);
    }

    // ---- the lifeboat: down the falls, released, away under power
    const boat = R.boat.current!;
    boat.visible = seq === "survived";
    const RELEASE = 4.3;
    if (boat.visible) {
      if (t < RELEASE) {
        const local = st.v.set(DAVIT.x, 0, DAVIT.z + 0.15);
        st.inv.copy(st.m).invert();
        const water = st.w.set(DAVIT.x, SEA_Y + 0.25 + waveHeight(ship.position.x + DAVIT.x, DAVIT.z, t, swell), DAVIT.z).applyMatrix4(st.inv).y;
        local.y = DAVIT.y - 1.0 + (water - (DAVIT.y - 1.0)) * ramp(t, 0.5, RELEASE - 0.2);
        boat.position.copy(local).applyMatrix4(st.m);
        boat.quaternion.copy(ship.quaternion);
        // the falls run from the davit heads to the boat's hooks
        for (const [f, dx] of [[R.fallA.current!, -0.55], [R.fallB.current!, 0.55]] as const) {
          const top = st.w.set(DAVIT.x + dx, DAVIT.y, DAVIT.z).applyMatrix4(st.m);
          const bot = _p.set(DAVIT.x + dx, local.y + 0.55, DAVIT.z + 0.15).applyMatrix4(st.m);
          f.visible = true;
          f.position.copy(top).add(bot).multiplyScalar(0.5);
          f.scale.set(0.035, top.distanceTo(bot), 0.035);
          f.quaternion.setFromUnitVectors(_q0.set(0, 1, 0), top.sub(bot).normalize());
        }
      } else {
        R.fallA.current!.visible = R.fallB.current!.visible = false;
        // where she touched the water, then motoring out to starboard
        shipMatrix(seq, RELEASE, { ...st.pose }, st.rel);
        const p0 = st.w.set(DAVIT.x, 0, DAVIT.z + 0.15).applyMatrix4(st.rel);
        const a = t - RELEASE;
        const dist = a < 2 ? 0.45 * a * a : 1.8 + (a - 2) * 1.8;
        const turn = ramp(a, 0, 3) * 1.15;
        boat.position.set(p0.x + Math.sin(turn) * dist * 0.35 + ramp(a, 2, 9) * (a - 2) * 0.3, 0, p0.z + dist);
        const h0 = waveHeight(boat.position.x, boat.position.z, t, swell);
        boat.position.y = SEA_Y + h0 + 0.05;
        boat.rotation.set(
          Math.atan2(waveHeight(boat.position.x, boat.position.z + 1, t, swell) - h0, 1) * 0.8,
          -turn,
          Math.atan2(waveHeight(boat.position.x + 1.2, boat.position.z, t, swell) - h0, 1.2) * 0.8,
          "YXZ",
        );
      }
      st.boatPos.copy(boat.position);
      mats.boatLamp.opacity = 0.85 + Math.sin(t * 3) * 0.1;
      if (R.boatLight.current) R.boatLight.current.intensity = 3 + dawn * -2;
    } else if (R.fallA.current) R.fallA.current.visible = R.fallB.current!.visible = false;

    // ---- camera: the shot list
    const smp = sampleShot(seq, t, st.sample);
    const sh = smp.shot;
    const anchor = (f: string | undefined, local: Vector3) => {
      if (f === "rigid") local.applyMatrix4(st.m);
      else if (f === "ship") local.add(_p.set(ship.position.x, 0, ship.position.z));
      else if (f === "boat") local.add(_p.set(st.boatPos.x, 0, st.boatPos.z));
    };
    anchor(sh.frame, smp.pos);
    anchor(sh.lookFrame ?? sh.frame, smp.look);
    cam.position.copy(smp.pos);
    // handheld drift, per shot so a cut changes the rhythm
    const hand = reduced ? 0 : (sh.hand ?? 0.1);
    const ph = smp.index * 3.7;
    cam.position.x += (Math.sin(t * 0.73 + ph) + Math.sin(t * 1.31 + ph * 2) * 0.5) * hand;
    cam.position.y += (Math.sin(t * 0.91 + ph) + Math.sin(t * 1.7 + ph) * 0.4) * hand * 0.8;
    const minY = SEA_Y + waveHeight(cam.position.x, cam.position.z, t, swell) + 0.45;
    if (cam.position.y < minY) cam.position.y = minY;
    cam.lookAt(smp.look);
    const shake = reduced ? 0 : shakeAt(seq, t);
    if (shake > 0.001) {
      cam.position.x += Math.sin(t * 61) * shake * 0.3;
      cam.position.y += Math.sin(t * 47 + 1) * shake * 0.25;
      cam.rotateZ(Math.sin(t * 29) * shake * 0.05);
      cam.rotateX(Math.sin(t * 37 + 2) * shake * 0.03);
    }
    if (Math.abs(cam.fov - smp.fov) > 0.01 || cam.far < 500) {
      cam.fov = smp.fov;
      cam.far = 700;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // ---- lights: windows, nav lights, floods, emergency
    let main = 0;
    let red = 0;
    st.inv.copy(st.m).invert();
    const camLocal = st.fwd.copy(cam.position).applyMatrix4(st.inv);
    geo.panes.forEach((p, i) => {
      power(seq, t, p.p[0], i % 7, reduced, st.pw);
      const wy = st.v.set(...p.p).applyMatrix4(st.m).y;
      const wet = wy < SEA_Y + waveHeight(st.v.x, st.v.z, t, swell) + 0.1 ? 0 : 1;
      const on = awake[i] ? st.pw.main * wet : 0;
      const em = (p.kind === 2 || i % 3 === 0 ? st.pw.red : 0) * wet;
      const kw = on * (p.kind === 2 ? 0.75 : 1);
      st.color.setRGB(DARK.r + WARM.r * kw + RED.r * em * 0.9, DARK.g + WARM.g * kw + RED.g * em * 0.9, DARK.b + WARM.b * kw + RED.b * em * 0.9);
      paneMesh.setColorAt(i, st.color);
      main += on;
      red += em;
    });
    if (paneMesh.instanceColor) paneMesh.instanceColor.needsUpdate = true;
    const navOn = seq === "intro" ? 1 : failing(t, seq === "survived" ? 12 : 9.5, reduced, 3);
    LAMPS.forEach((l, i) => {
      power(seq, t, l.p[0], i, reduced, st.pw);
      const wy = st.v.set(...l.p).applyMatrix4(st.m).y;
      const wet = wy < SEA_Y + 0.1 ? 0 : 1;
      let k = (l.kind === "nav" ? navOn : st.pw.main) * wet;
      // sidelights and mastheads are screened: each shows only over its arc
      if (l.face) {
        const d = st.w.copy(camLocal).sub(st.v.set(...l.p)).normalize();
        k *= ramp(d.x * l.face[0] + d.y * l.face[1] + d.z * l.face[2], l.cos! - 0.08, l.cos! + 0.04);
      }
      mats.lamp[i].opacity = k * 0.95;
      mats.bulb[i].color.set(l.color).multiplyScalar(0.03 + 0.97 * k);
    });
    if (other.visible) {
      other.updateMatrixWorld();
      const oc = st.fwd.copy(cam.position).applyMatrix4(st.rel.copy(other.matrixWorld).invert());
      const dark = t > T_HIT + 0.2 ? 0.55 + 0.45 * Math.sin(t * 9) ** 2 : 1;
      OTHER_LAMPS.forEach((l, i) => {
        let k = l.kind === "flood" ? dark : 1;
        if (l.face) {
          const d = st.w.copy(oc).sub(st.v.set(...l.p)).normalize();
          k *= ramp(d.x * l.face[0] + d.y * l.face[1] + d.z * l.face[2], l.cos! - 0.08, l.cos! + 0.04);
        }
        mats.other[i].opacity = k;
      });
      if (R.otherLight.current) R.otherLight.current.intensity = 14 * dark;
    }
    const mainAvg = main / geo.panes.length;
    const redAvg = red / geo.panes.length;
    power(seq, t, 2, 1, reduced, st.pw);
    if (R.deckA.current) R.deckA.current.intensity = 40 * st.pw.main;
    power(seq, t, -6, 2, reduced, st.pw);
    if (R.deckB.current) R.deckB.current.intensity = 18 * st.pw.main;
    const redAft = st.pw.red;
    sea.uniforms.shipLight.value = Math.min(1, mainAvg * 2.2);
    sea.uniforms.shipRed.value = Math.min(1, redAvg * 3);
    // white water along the hull while the sea is coming over her deck edge
    sea.uniforms.wash.value = seq === "lost" ? ramp(t, 2, 4) * (1 - ramp(t, 12.4, 13.2)) : seq === "survived" ? ramp(t, 6, 10) * 0.7 * (1 - ramp(t, 16, 18)) : ramp(t, T_HIT + 6, T_HIT + 10) * 0.35;
    // the emergency strobe over the bridge: red, slow, relentless
    const pulse = reduced ? 0.7 : Math.sin(t * 5.5) > 0.2 ? 1 : 0.08;
    const strobeOn = seq === "intro" ? ramp(t, T_HIT + 4.4, T_HIT + 4.6) : seq === "survived" ? failing(t, 10.5, reduced, 4) : failing(t, 9.6, reduced, 4);
    const e = pulse * strobeOn;
    mats.strobe.opacity = e;
    R.strobe.current?.scale.setScalar(1.4 + e * 1.8);
    if (R.emergency.current) R.emergency.current.intensity = (e * 28 + redAft * 10) * (ship.position.y > -6 ? 1 : 0);
    if (R.redDeck.current) R.redDeck.current.intensity = seq === "lost" ? (14 + e * 18) * failing(t, 8.5, reduced, 6) : 0;

    // ---- lightning
    let flash = 0;
    let strike = -1;
    def.strikes.forEach((s, i) => {
      const e2 = strikeEnvelope(t - s.at);
      if (e2 > flash) {
        flash = e2;
        strike = i;
      }
    });
    if (reduced) flash = Math.min(flash, 0.25);
    const bm = R.bolt.current!;
    if (strike >= 0 && strike !== st.lastStrike) {
      st.lastStrike = strike;
      cam.getWorldDirection(st.fwd);
      st.fwd.y = 0;
      st.fwd.normalize().applyAxisAngle(_q0.set(0, 1, 0), def.strikes[strike].ang);
      bm.geometry = geo.bolts[strike % geo.bolts.length];
      bm.position.copy(cam.position).addScaledVector(st.fwd, 230);
      bm.position.y = -8;
      bm.lookAt(cam.position.x, bm.position.y, cam.position.z);
      sea.uniforms.flashDir.value.copy(st.fwd).setY(0.35).normalize();
      R.flash.current?.position.copy(st.fwd).multiplyScalar(60).setY(50);
    }
    bm.visible = !reduced && flash > 0.2;
    boltMat.opacity = Math.min(1, flash * 1.3);
    sky.uniforms.flash.value = flash;
    sea.uniforms.flash.value = flash * 0.6;
    rain.uniforms.flash.value = flash;
    if (R.flash.current) R.flash.current.intensity = flash * 6;

    // ---- spray bursts
    let sp: (typeof def.sprays)[number] | null = null;
    for (const s of def.sprays) if (t >= s.at) sp = s;
    const age = sp ? t - sp.at : 99;
    spray.uniforms.age.value = age;
    if (sp && age < 3) {
      if (sp.anchor === "bow" || sp.anchor === "impact") spray.uniforms.origin.value.copy(STEM).setZ(sp.anchor === "impact" ? 2.2 : 0.9).applyMatrix4(st.m);
      else spray.uniforms.origin.value.copy(st.boatPos);
      spray.uniforms.side.value.set(0, 0, 1);
      spray.uniforms.fwd.value.set(1, 0, 0).applyQuaternion(ship.quaternion);
      spray.uniforms.power.value = sp.power;
      spray.uniforms.light.value = 0.35 + flash * 0.8 + mainAvg * 0.6 + dawn * 0.6;
      spray.uniforms.px.value = size.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    }
    if (R.sprayPts.current) R.sprayPts.current.visible = age < 3;

    // ---- the air: dawn lifts the murk; the fade card for dips and the end
    const fogC = sea.uniforms.fogC.value as Color;
    fogC.setRGB(0.05 + dawn * 0.32, 0.068 + dawn * 0.26, 0.085 + dawn * 0.24);
    R.fog.current?.color.copy(fogC);
    (scene.background as Color | null)?.copy(fogC);
    const tr = transitions(seq, t);
    const impactWhite = seq === "intro" && !reduced ? Math.max(0, 1 - Math.abs(t - T_HIT - 0.05) / 0.25) * 0.85 : 0;
    const white = Math.max(tr.white, impactWhite);
    const fade = R.fade.current!;
    fade.position.copy(cam.position).addScaledVector(cam.getWorldDirection(st.fwd), 0.3);
    fade.quaternion.copy(cam.quaternion);
    if (white > tr.black) {
      fadeMat.color.setRGB(1, 0.97, 0.92);
      fadeMat.opacity = white;
    } else {
      fadeMat.color.setRGB(0, 0, 0);
      fadeMat.opacity = tr.black;
    }
    fade.visible = fadeMat.opacity > 0.002;

    // ---- sound cues, fired once as t crosses them (never on a pinned clock)
    if (window.__btwCineClock === undefined) for (const c of def.cues) if (st.lastT < c.at && t >= c.at && t - c.at < 0.5) cinematicCue(c.cue);
    st.lastT = t;
  });

  const P = geo.parts;
  const S = (k: keyof typeof SURF) => SURF[k][tier];
  return (
    <>
      <color attach="background" args={["#0a1218"]} />
      <fog ref={refs.fog} attach="fog" args={["#0a1218", 35, 240]} />
      <group ref={root}>
      <ambientLight intensity={0.35} color="#9fb3c4" />
      <hemisphereLight args={["#6a8098", "#0a1014", 0.9]} />
      {/* a cold rim from the lit horizon behind her, so she reads in silhouette */}
      <directionalLight position={[40, 18, -60]} intensity={1.4} color="#9fb6d0" />
      <directionalLight position={[-30, 25, 40]} intensity={0.35} color="#7088a0" />
      <directionalLight ref={refs.flash} position={[-30, 50, -40]} intensity={0} color="#dfe8ff" />
      <mesh geometry={geo.sky} material={sky} frustumCulled={false} />
      <mesh geometry={geo.sea} material={sea} position={[0, SEA_Y, 0]} frustumCulled={false} />
      <lineSegments geometry={geo.rain} material={rain} frustumCulled={false} />
      <points ref={refs.sprayPts as never} geometry={geo.spray} material={spray} frustumCulled={false} visible={false} />
      <mesh ref={refs.bolt} material={boltMat} visible={false} frustumCulled={false} />
      <group ref={refs.ship}>
        <mesh geometry={geo.hull} material={S("hull")} />
        <mesh geometry={P.house} material={S("house")} />
        <mesh geometry={P.steel} material={S("steel")} />
        <mesh geometry={P.hatch} material={S("hatch")} />
        <mesh geometry={P.funnel} material={S("funnel")} />
        <mesh geometry={P.band} material={S("band")} />
        <mesh geometry={P.black} material={S("black")} />
        <mesh geometry={P.glassFrame} material={S("black")} />
        <primitive object={paneMesh} />
        <primitive object={recessMesh} />
        {LAMPS.map((l, i) => (
          <group key={i} position={l.p}>
            <mesh geometry={geo.bulb} material={mats.bulb[i]} />
            <sprite material={mats.lamp[i]} scale={l.size} />
          </group>
        ))}
        {/* the empty port lifeboat cradle is implied; the starboard boat rides on its own */}
        <pointLight ref={refs.deckA} position={[3, 6.2, 1.2]} distance={18} decay={1.5} color="#ffcf8a" intensity={0} />
        <pointLight ref={refs.deckB} position={[-4.6, 5.2, 3.6]} distance={12} decay={1.6} color="#ffcf8a" intensity={0} />
        <pointLight ref={refs.emergency} position={[-5.0, 6.8, 0]} distance={22} decay={1.4} color="#ff2a18" intensity={0} />
        <pointLight ref={refs.redDeck} position={[-3.2, 4.4, 2.8]} distance={16} decay={1.4} color="#ff2a18" intensity={0} />
        <sprite ref={refs.strobe} material={mats.strobe} position={[-7.6, 8.25, 0]} />
      </group>
      <group ref={refs.other} visible={false}>
        <mesh geometry={geo.hull} material={S("other")} />
        <mesh geometry={P.house} material={S("otherHouse")} />
        <mesh geometry={P.steel} material={S("steel")} />
        <mesh geometry={P.hatch} material={S("other")} />
        <mesh geometry={P.funnel} material={S("black")} />
        <primitive object={otherPanes} />
        {OTHER_LAMPS.map((l, i) => (
          <sprite key={i} material={mats.other[i]} position={l.p} scale={l.size} />
        ))}
        <pointLight ref={refs.otherLight} position={[8, 6, 0]} distance={22} decay={1.5} color="#ffd59a" intensity={0} />
      </group>
      <group ref={refs.boat} visible={false}>
        <mesh geometry={geo.boat.hull} material={S("boat")} />
        <mesh geometry={geo.boat.canopy} material={S("canopy")} />
        <sprite material={mats.boatLamp} position={[0.2, 0.62, 0]} scale={1.6} />
        <pointLight ref={refs.boatLight} position={[0.6, 1.6, 0.8]} distance={8} color="#ffd9a0" intensity={0} />
      </group>
      <mesh ref={refs.fallA} geometry={geo.rod} material={S("steel")} visible={false} />
      <mesh ref={refs.fallB} geometry={geo.rod} material={S("steel")} visible={false} />
      <mesh ref={refs.fade} geometry={geo.pane} material={fadeMat} scale={[4, 4, 1]} renderOrder={999} frustumCulled={false} visible={false} />
      </group>
    </>
  );
}

const _q0 = new Vector3();

/** A jagged bolt from cloud to sea, as a flat ribbon facing the camera. */
function boltGeometry(seed: number) {
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const pts: number[] = [];
  const idx: number[] = [];
  const branch = (x: number, y: number, len: number, w: number, depth: number) => {
    let px = x;
    let py = y;
    const first = pts.length / 3;
    const steps = Math.round(len / 4);
    for (let i = 0; i <= steps; i++) {
      pts.push(px - w, py, 0, px + w, py, 0);
      if (i > 0) {
        const a = first + (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      if (depth < 2 && rand() < 0.14) branch(px, py, len * 0.35, w * 0.5, depth + 1);
      px += (rand() - 0.5) * 6;
      py -= 4;
    }
  };
  branch(0, 100, 106, 0.7, 0);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
  g.setIndex(idx);
  return g;
}

/** Flash envelope of one strike `dt` seconds after it began: a double flicker. */
const strikeEnvelope = (dt: number): number => (dt < 0 ? 0 : dt < 0.07 ? 1 : dt < 0.13 ? 0.25 : dt < 0.22 ? 0.9 : Math.exp(-(dt - 0.22) * 9));
