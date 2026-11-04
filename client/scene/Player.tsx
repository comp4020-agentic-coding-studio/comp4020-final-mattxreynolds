// First-person controller: pointer-lock look, WASD with collision, centre
// raycast against interactables, E / click to use (hold supported).

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler, Raycaster, Vector2, Vector3, type Object3D } from "three";
import { ACT_OF } from "../../shared/protocol.ts";
import { useStore } from "../store.ts";
import { motion } from "./fx/pool.ts";
import { moveWithCollision, type RoomLayout } from "./colliders.ts";
import { findInteractable, interactables } from "./interact.tsx";

const EYE = 1.6;
const SPEED = 2.4;
const FAST = 1.7;
const REACH = 2.4;
/** ~3 degrees; pitch about a third of it */
const MAX_ROLL = 0.052;
const MAX_PITCH = 0.018;
const SENSITIVITY = 0.0022;
/** A second press on the same control inside this window is the same intent
 * (E and a click together, a bouncing key), not a new one. */
const PRESS_DEBOUNCE_MS = 120;

/** Visible only if it and every ancestor is (rooms hide stations while their
 * shaders compile; three's raycaster ignores visibility). */
function shown(o: Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function Player({ layout }: { layout: RoomLayout }) {
  const { camera, gl, scene } = useThree();
  const keys = useRef(new Set<string>());
  const pos = useRef(new Vector3(...layout.spawn));
  const euler = useRef(new Euler(0, layout.spawnYaw, 0, "YXZ"));
  const aimed = useRef<string | null>(null);
  const holding = useRef<string | null>(null);
  const ray = useRef(new Raycaster());
  const respawn = useStore((s) => s.respawn);

  useEffect(() => {
    pos.current.set(...layout.spawn);
    euler.current.set(0, layout.spawnYaw, 0);
  }, [layout, respawn]);

  // dev/screenshot hook (scripts/screenshot.ts): set pose without pointer lock
  useEffect(() => {
    window.__btwPose = ({ x, z, yaw, pitch }) => {
      if (x !== undefined && z !== undefined) pos.current.set(x, layout.spawn[1], z);
      euler.current.set(pitch ?? 0, layout.spawnYaw + (yaw ?? 0), 0);
    };
    return () => {
      delete window.__btwPose;
    };
  }, [layout]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      useStore.setState({ locked });
      if (!locked) {
        keys.current.clear();
        release();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      euler.current.y -= e.movementX * SENSITIVITY;
      euler.current.x = Math.max(-1.4, Math.min(1.4, euler.current.x - e.movementY * SENSITIVITY));
    };
    let lastPress = { id: "", at: 0 };
    const press = () => {
      const id = aimed.current;
      if (!id) return;
      const now = performance.now();
      if (lastPress.id === id && now - lastPress.at < PRESS_DEBOUNCE_MS) return;
      lastPress = { id, at: now };
      const entry = interactables.get(id);
      if (!entry || entry.def.disabled) return;
      if (entry.def.onHold) {
        holding.current = id;
        entry.def.onHold(true);
      }
      entry.def.onUse?.();
    };
    const release = () => {
      const id = holding.current;
      holding.current = null;
      if (id) interactables.get(id)?.def.onHold?.(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.code === "KeyE" && !e.repeat) press();
      keys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (e.code === "KeyE") release();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas && e.button === 0) press();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) release();
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", release);
    };
  }, [gl]);

  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const centre = useRef(new Vector2(0, 0));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = keys.current;
    const yaw = euler.current.y;
    forward.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.current.set(Math.cos(yaw), 0, -Math.sin(yaw));
    let mx = 0;
    let mz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) { mx += forward.current.x; mz += forward.current.z; }
    if (k.has("KeyS") || k.has("ArrowDown")) { mx -= forward.current.x; mz -= forward.current.z; }
    if (k.has("KeyD") || k.has("ArrowRight")) { mx += right.current.x; mz += right.current.z; }
    if (k.has("KeyA") || k.has("ArrowLeft")) { mx -= right.current.x; mz -= right.current.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const sp = (SPEED * (k.has("ShiftLeft") || k.has("ShiftRight") ? FAST : 1) * dt) / len;
      const [nx, nz] = moveWithCollision(layout, pos.current.x, pos.current.z, mx * sp, mz * sp);
      pos.current.x = nx;
      pos.current.z = nz;
    }

    // ship motion, applied to the camera only (never the room, so collisions
    // are untouched): a slow roll/pitch that grows with act and danger, plus
    // decaying jolts on breach / compartment loss. Max roll ~3 deg; zero when
    // reduced motion is set.
    const { view, reducedMotion } = useStore.getState();
    const danger = (view?.danger ?? 0) / 100;
    const act = view ? ACT_OF[view.phase] || 0 : 0;
    const t = performance.now() / 1000;
    motion.jolt = Math.max(0, motion.jolt - dt * 1.3);
    let roll = 0;
    let pitch = 0;
    if (!reducedMotion) {
      const amp = Math.min(1, 0.12 + act * 0.1 + danger * 0.55);
      const j = Math.min(1, motion.jolt);
      roll = amp * MAX_ROLL * (0.7 * Math.sin(t * 0.45) + 0.3 * Math.sin(t * 1.1 + 1)) + Math.sin(t * 38) * 0.008 * j + j * 0.012 * Math.sin(t * 9);
      pitch = amp * MAX_PITCH * Math.sin(t * 0.33 + 2) + Math.sin(t * 31 + 1) * 0.006 * j;
      roll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, roll));
    }
    camera.position.set(pos.current.x, EYE + (reducedMotion ? 0 : Math.sin(t * 0.8) * 0.01), pos.current.z);
    camera.rotation.set(euler.current.x + pitch, euler.current.y, roll, "YXZ");

    // aim
    ray.current.setFromCamera(centre.current, camera);
    ray.current.far = REACH;
    const hit = ray.current.intersectObjects(scene.children, true).find((h) => shown(h.object));
    const entry = hit ? findInteractable(hit.object) : null;
    const id = entry && !entry.def.disabled ? entry.def.id : null;
    aimed.current = id;
    const prompt = id ? entry!.def.prompt : null;
    if (useStore.getState().prompt !== prompt) useStore.setState({ prompt });
    if (holding.current && holding.current !== id) {
      const held = holding.current;
      holding.current = null;
      interactables.get(held)?.def.onHold?.(false);
    }
  });

  return null;
}
