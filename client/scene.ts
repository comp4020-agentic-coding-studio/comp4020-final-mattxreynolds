// The vanilla three.js scene (ADR 0006): built once from Room data by
// buildScene, never re-created on a state change, and its render loop reads
// nothing from Svelte. Walking is the pure box check in shared/rooms.ts.
import * as THREE from "three";
import type { Slot } from "../shared/draw.ts";
import type { Pose } from "../shared/intents.ts";
import { moveInRoom, pickThing, type Room, type Thing } from "../shared/rooms.ts";
import { walkTowards, type ControlsMode, type Walk } from "./controls.ts";

export interface SceneHandle {
  canvas: HTMLCanvasElement;
  /** The Puzzles whose areas are open; their blockers stop blocking and stop being drawn. */
  setOpened(opened: ReadonlySet<Slot>): void;
  /** The virtual joystick's walk, each axis -1..1; {0,0} lets go. */
  setStick(walk: Walk): void;
  /** "tap" turns a tap or click on the floor into a walk there; "direct" leaves walking to keys and the stick. */
  setMode(mode: ControlsMode): void;
  /** Text for a thing's face: the Clue on the mural, the code typed so far on the keypad display. */
  setScreen(which: "clue" | "code" | "order", text: string): void;
  dispose(): void;
}

const WALK_SPEED = 2.5; // metres per second
const LOOK_SPEED = 0.0025; // radians per pixel of mouse movement
const DRAG_LOOK_SPEED = 0.005; // radians per pixel of a finger drag
const TAP_SLOP = 10; // pixels a finger may move and still be a tap
const KEYS: Record<string, "forward" | "back" | "left" | "right"> = {
  w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right",
};

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
}

/** A face for a thing, drawn on a canvas texture; returns the plane and a way to change its text. */
function face(t: Thing, text: string): { mesh: THREE.Mesh; draw: (text: string) => void } {
  const cv = document.createElement("canvas");
  cv.width = Math.round(t.size[0] * 256);
  cv.height = Math.round(t.size[1] * 256);
  const ctx = cv.getContext("2d")!;
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  const typed = t.screen === "code" || t.screen === "order";
  const draw = (words: string): void => {
    ctx.fillStyle = t.press ? "#e9dcc0" : "#f2ead6";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#1b1b1b";
    ctx.textAlign = t.press || typed ? "center" : "left";
    ctx.textBaseline = "middle";
    const lines = t.press || typed ? [words] : words.split("\n");
    const size = t.press || typed ? cv.height * 0.5 : Math.min((cv.height / Math.max(lines.length, 1)) * 0.7, cv.width / 14);
    ctx.font = `bold ${size}px monospace`;
    const x = t.press || typed ? cv.width / 2 : 12;
    lines.forEach((line, i) => ctx.fillText(line, x, ((i + 0.5) * cv.height) / lines.length, cv.width - 24));
    texture.needsUpdate = true;
  };
  draw(text);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.size[0] * 0.92, t.size[1] * 0.92), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set(t.x, t.y, t.z + t.size[2] / 2 + 0.002);
  return { mesh, draw };
}

/** Throws if the browser cannot make a WebGL context; the caller shows the 2D views instead. */
export function buildScene(room: Room, opened: ReadonlySet<Slot>, start: Pose | null = null, onPose: (pose: Pose) => void = () => {}, onUse: (thing: Thing) => void = () => {}): SceneHandle {
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
  // Buttons and screens carry writing on their faces: key labels, the mural, the typed code.
  const screens = new Map<string, (text: string) => void>();
  for (const t of room.things) {
    if (!t.press && !t.screen) continue;
    const label = t.press === "enter" && t.control === "levers" ? "SET" : t.press?.replace(/^lever-/, "").toUpperCase();
    const f = face(t, label ?? "");
    scene.add(f.mesh);
    if (t.screen) screens.set(t.screen, f.draw);
  }

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
  // a returning Player stands where they were (#57); walls still bound them
  if (start) Object.assign(me, moveInRoom(room, new Set(), start, 0, 0), { yaw: start.yaw, pitch: Math.max(-1.2, Math.min(1.2, start.pitch)) });
  let reported = `${me.x},${me.z},${me.yaw},${me.pitch}`;

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

  // Touch and pen: dragging looks; in tap mode a press that barely moved walks to that spot on the floor.
  let mode: ControlsMode = "direct";
  let stick: Walk = { forward: 0, right: 0 };
  let target: { x: number; z: number } | null = null;
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  const pointerdown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && mode === "direct") return;
    if (drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  const pointermove = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > TAP_SLOP) drag.moved = true;
    if (drag.moved) {
      me.yaw -= (e.clientX - drag.x) * DRAG_LOOK_SPEED;
      me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch - (e.clientY - drag.y) * DRAG_LOOK_SPEED));
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const pointerup = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const tapped = !drag.moved;
    drag = null;
    if (!tapped || mode !== "tap") return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
    if (hit) target = { x: hit.x, z: hit.z };
  };
  const pointercancel = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", pointerup);
  canvas.addEventListener("pointercancel", pointercancel);

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
    // While the mouse is captured, clicks reach the canvas rather than the prompt, so any click also releases it.
    if (locked) document.exitPointerLock();
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
    let f = (held.forward ? 1 : 0) - (held.back ? 1 : 0) + stick.forward;
    let r = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stick.right;
    if (f || r) target = null; // steering by hand cancels a tap-to-walk
    else if (target) {
      const toward = walkTowards(me, me.yaw, target);
      if (toward) ({ forward: f, right: r } = toward);
      else target = null;
    }
    if (f || r) {
      const len = Math.max(Math.hypot(f, r), 1);
      const step = (WALK_SPEED * dt) / len;
      // yaw 0 looks north (towards -z); right is (cos, -sin)
      const dx = (-Math.sin(me.yaw) * f + Math.cos(me.yaw) * r) * step;
      const dz = (-Math.cos(me.yaw) * f - Math.sin(me.yaw) * r) * step;
      Object.assign(me, moveInRoom(room, open, me, dx, dz));
    }
    camera.position.set(me.x, room.eyeHeight, me.z);
    camera.rotation.set(me.pitch, me.yaw, 0);
    renderer.render(scene, camera);
    const now4 = `${me.x},${me.z},${me.yaw},${me.pitch}`;
    if (now4 !== reported) {
      reported = now4;
      onPose({ x: me.x, y: room.eyeHeight, z: me.z, yaw: me.yaw, pitch: me.pitch });
    }
    frames++;
    canvas.dataset.frames = String(frames);
    canvas.dataset.x = me.x.toFixed(3);
    canvas.dataset.z = me.z.toFixed(3);
    canvas.dataset.yaw = me.yaw.toFixed(3);
    // where each thing is on screen, in CSS px from the canvas corner: a test seam, drawn nowhere
    const centres: Record<string, number[]> = {};
    for (const t of room.things) {
      const at = screenOf(t.id);
      if (at) centres[t.id] = [Math.round(at.x), Math.round(at.y)];
    }
    canvas.dataset.things = JSON.stringify(centres);
    // and how big each thing's front face is on screen, in CSS px (width, height)
    const sizes: Record<string, number[]> = {};
    for (const t of room.things) {
      const z = t.z + t.size[2] / 2;
      const px = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, z).project(camera);
      const l = px(t.x - t.size[0] / 2, t.y);
      const r = px(t.x + t.size[0] / 2, t.y);
      const u = px(t.x, t.y + t.size[1] / 2);
      const d = px(t.x, t.y - t.size[1] / 2);
      if (Math.max(l.z, r.z, u.z, d.z) > 1) continue;
      sizes[t.id] = [Math.round((Math.abs(r.x - l.x) / 2) * canvas.clientWidth), Math.round((Math.abs(u.y - d.y) / 2) * canvas.clientHeight)];
    }
    canvas.dataset.sizes = JSON.stringify(sizes);
  };
  raf = requestAnimationFrame(frame);

  return {
    canvas,
    setOpened(next) {
      open = next;
      showOpened();
    },
    setStick(walk) {
      stick = walk;
    },
    setScreen(which, text) {
      screens.get(which)?.(text);
    },
    setMode(next) {
      mode = next;
      target = null;
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", click);
      observer.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mousemove);
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup);
      canvas.removeEventListener("pointercancel", pointercancel);
      renderer.dispose();
    },
  };
}
