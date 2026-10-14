// The vanilla three.js scene (ADR 0006): built once from Room data by
// buildScene, never re-created on a state change, and its render loop reads
// nothing from Svelte. Walking is the pure box check in shared/rooms.ts.
import * as THREE from "three";
import type { Slot } from "../shared/draw.ts";
import { moveInRoom, pickThing, type Room, type Thing } from "../shared/rooms.ts";

export interface SceneHandle {
  canvas: HTMLCanvasElement;
  /** The Puzzles whose areas are open; their blockers stop blocking and stop being drawn. */
  setOpened(opened: ReadonlySet<Slot>): void;
  dispose(): void;
}

const WALK_SPEED = 2.5; // metres per second
const LOOK_SPEED = 0.0025; // radians per pixel of mouse movement
const KEYS: Record<string, "forward" | "back" | "left" | "right"> = {
  w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right",
};

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
}

/** Throws if the browser cannot make a WebGL context; the caller shows the 2D views instead. */
export function buildScene(room: Room, opened: ReadonlySet<Slot>, onUse: (thing: Thing) => void = () => {}): SceneHandle {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2229);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2), new THREE.PointLight(0xffd9a0, 40, 20));

  const { width, depth, wallHeight } = room;
  scene.add(box(width, 0.1, depth, 0x4a3f35, width / 2, -0.05, depth / 2));
  scene.add(box(width, 0.1, depth, 0x2b2b2b, width / 2, wallHeight + 0.05, depth / 2));
  scene.add(box(width, wallHeight, 0.1, 0x6b6f75, width / 2, wallHeight / 2, -0.05));
  scene.add(box(width, wallHeight, 0.1, 0x6b6f75, width / 2, wallHeight / 2, depth + 0.05));
  scene.add(box(0.1, wallHeight, depth, 0x73777d, -0.05, wallHeight / 2, depth / 2));
  scene.add(box(0.1, wallHeight, depth, 0x73777d, width + 0.05, wallHeight / 2, depth / 2));

  // Nothing marks a usable thing as usable (#33): stations and decoys are drawn alike.
  for (const t of room.things) scene.add(box(...t.size, 0x8a6a3a, t.x, t.y, t.z));

  const blockerMeshes = room.blockers.map((b) => {
    const w = b.box.maxX - b.box.minX;
    const d = b.box.maxZ - b.box.minZ;
    const mesh = box(w, b.height, d, b.opensWith ? 0x7a3b2e : 0x555a60, b.box.minX + w / 2, b.height / 2, b.box.minZ + d / 2);
    scene.add(mesh);
    return { blocker: b, mesh };
  });

  let open: ReadonlySet<Slot> = opened;
  const showOpened = (): void => {
    for (const { blocker, mesh } of blockerMeshes) mesh.visible = !(blocker.opensWith && open.has(blocker.opensWith));
  };
  showOpened();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  camera.rotation.order = "YXZ";
  const me = { x: room.start.x, z: room.start.z, yaw: room.start.yaw, pitch: 0 };

  const resize = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // hold the horizontal view near 75 degrees, so portrait stays playable (#17)
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(75) / 2) / camera.aspect));
    camera.fov = Math.min(camera.fov, 100);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const held = { forward: false, back: false, left: false, right: false };
  const onKey = (down: boolean) => (e: KeyboardEvent): void => {
    const dir = KEYS[e.key.toLowerCase()];
    if (!dir) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    held[dir] = down;
  };
  const keydown = onKey(true);
  const keyup = onKey(false);
  const blur = (): void => { held.forward = held.back = held.left = held.right = false; };
  const mousemove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return;
    me.yaw -= e.movementX * LOOK_SPEED;
    me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch - e.movementY * LOOK_SPEED));
  };
  // A press on the canvas uses the nearest thing within 22 px that is in reach and in front (#52). With the
  // mouse captured the press is at the middle of the view. A miss does nothing at all.
  const thingCentres = new Map<string, THREE.Vector3>(room.things.map((t) => [t.id, new THREE.Vector3(t.x, t.y, t.z)]));
  const screenOf = (id: string): { x: number; y: number } | null => {
    const v = thingCentres.get(id)!.clone().project(camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  };
  const click = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const locked = document.pointerLockElement === canvas;
    const px = locked ? canvas.clientWidth / 2 : e.clientX - rect.left;
    const py = locked ? canvas.clientHeight / 2 : e.clientY - rect.top;
    const hit = pickThing(room, me, (t) => {
      const at = screenOf(t.id);
      return at ? Math.hypot(at.x - px, at.y - py) : Infinity;
    });
    if (hit) onUse(hit);
  };
  canvas.addEventListener("click", click);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  document.addEventListener("mousemove", mousemove);

  let frames = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const f = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
    const r = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (f || r) {
      const len = Math.hypot(f, r);
      const step = (WALK_SPEED * dt) / len;
      // yaw 0 looks north (towards -z); right is (cos, -sin)
      const dx = (-Math.sin(me.yaw) * f + Math.cos(me.yaw) * r) * step;
      const dz = (-Math.cos(me.yaw) * f - Math.sin(me.yaw) * r) * step;
      Object.assign(me, moveInRoom(room, open, me, dx, dz));
    }
    camera.position.set(me.x, room.eyeHeight, me.z);
    camera.rotation.set(me.pitch, me.yaw, 0);
    renderer.render(scene, camera);
    frames++;
    canvas.dataset.frames = String(frames);
    canvas.dataset.x = me.x.toFixed(3);
    canvas.dataset.z = me.z.toFixed(3);
    // where each thing is on screen, in CSS px from the canvas corner: a test seam, drawn nowhere
    const centres: Record<string, number[]> = {};
    for (const t of room.things) {
      const at = screenOf(t.id);
      if (at) centres[t.id] = [Math.round(at.x), Math.round(at.y)];
    }
    canvas.dataset.things = JSON.stringify(centres);
  };
  raf = requestAnimationFrame(frame);

  return {
    canvas,
    setOpened(next) {
      open = next;
      showOpened();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", click);
      observer.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mousemove);
      renderer.dispose();
    },
  };
}
