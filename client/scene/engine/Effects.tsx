// One-shot particle effects: steam puffs (fading spheres) and sparks
// (instanced emissive chips). Pools are allocated once; spawn functions are
// module-level so fx handlers can call them from anywhere. Also holds the
// light "kicks" (dip on trip, flash on power-up) the Lighting reads.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, BoxGeometry, Vector3 } from "three";

type V3 = [number, number, number];

const STEAM_N = 36;
const SPARK_N = 90;

type Puff = { alive: boolean; t: number; life: number; p: Vector3; v: Vector3; s: number };
type Spark = { alive: boolean; t: number; life: number; p: Vector3; v: Vector3 };

const puffs: Puff[] = Array.from({ length: STEAM_N }, () => ({ alive: false, t: 0, life: 1, p: new Vector3(), v: new Vector3(), s: 0.2 }));
const sparks: Spark[] = Array.from({ length: SPARK_N }, () => ({ alive: false, t: 0, life: 1, p: new Vector3(), v: new Vector3() }));
let puffNext = 0;
let sparkNext = 0;

/** Light kicks read (and decayed) by Lighting: dip darkens, flash brightens. */
export const kicks = { dip: 0, flash: 0, hum: 0, contact: 0, arc: 0 };

/** A burst of steam at `at`, blowing roughly along `dir`. */
export function spawnSteam(at: V3, dir: V3 = [0, 1, 0], count = 14): void {
  for (let i = 0; i < count; i++) {
    const p = puffs[puffNext++ % STEAM_N];
    p.alive = true;
    p.t = 0;
    p.life = 1.4 + Math.random() * 1.2;
    p.s = 0.12 + Math.random() * 0.12;
    p.p.set(at[0] + (Math.random() - 0.5) * 0.1, at[1] + (Math.random() - 0.5) * 0.1, at[2] + (Math.random() - 0.5) * 0.1);
    p.v.set(
      dir[0] * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6,
      dir[1] * (0.6 + Math.random()) + 0.5 + Math.random() * 0.4,
      dir[2] * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6,
    );
  }
}

/** A shower of sparks at `at`. */
export function spawnSparks(at: V3, count = 24): void {
  for (let i = 0; i < count; i++) {
    const s = sparks[sparkNext++ % SPARK_N];
    s.alive = true;
    s.t = 0;
    s.life = 0.4 + Math.random() * 0.6;
    s.p.set(at[0], at[1], at[2]);
    s.v.set((Math.random() - 0.5) * 3, Math.random() * 2.2, (Math.random() - 0.2) * 2.4);
  }
}

export function Effects() {
  const steamGeo = useMemo(() => new SphereGeometry(0.5, 10, 8), []);
  const steamMats = useMemo(
    () => puffs.map(() => new MeshBasicMaterial({ color: "#e8eef0", transparent: true, opacity: 0, depthWrite: false })),
    [],
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  const sparkGeo = useMemo(() => new BoxGeometry(0.025, 0.025, 0.07), []);
  const sparkMat = useMemo(() => new MeshBasicMaterial({ color: new Color(2.5, 1.9, 0.8), toneMapped: false }), []);
  const inst = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const zero = useMemo(() => new Matrix4().makeScale(0, 0, 0), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    puffs.forEach((p, i) => {
      const m = meshes.current[i];
      if (!m) return;
      if (!p.alive) {
        m.visible = false;
        return;
      }
      p.t += dt;
      if (p.t > p.life) {
        p.alive = false;
        m.visible = false;
        return;
      }
      p.v.multiplyScalar(1 - dt * 1.4);
      p.v.y += dt * 0.25;
      p.p.addScaledVector(p.v, dt);
      const k = p.t / p.life;
      m.visible = true;
      m.position.copy(p.p);
      m.scale.setScalar(p.s * (1 + k * 4));
      steamMats[i].opacity = 0.55 * (1 - k) * Math.min(1, p.t * 8);
    });
    const im = inst.current;
    if (im) {
      sparks.forEach((s, i) => {
        if (!s.alive) {
          im.setMatrixAt(i, zero);
          return;
        }
        s.t += dt;
        if (s.t > s.life) {
          s.alive = false;
          im.setMatrixAt(i, zero);
          return;
        }
        s.v.y -= 9 * dt;
        s.p.addScaledVector(s.v, dt);
        if (s.p.y < 0.02) {
          s.p.y = 0.02;
          s.v.y *= -0.3;
        }
        tmp.position.copy(s.p);
        tmp.lookAt(s.p.x + s.v.x, s.p.y + s.v.y, s.p.z + s.v.z);
        tmp.scale.setScalar(1 - s.t / s.life);
        tmp.updateMatrix();
        im.setMatrixAt(i, tmp.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {puffs.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={steamGeo}
          material={steamMats[i]}
          visible={false}
          raycast={() => null}
        />
      ))}
      <instancedMesh ref={inst} args={[sparkGeo, sparkMat, SPARK_N]} frustumCulled={false} raycast={() => null} />
    </group>
  );
}
